/**
 * Canonical beneficiary resolution for imported ledger rows.
 *
 * This logic previously existed twice — once in `csv-transformer.ts` (used by
 * the initial import) and once in `journal-apply.ts` (used by Apply / Apply
 * All / re-apply) — and the two had drifted: only one handled the `all`
 * keyword, case-insensitive group names and transfer types. The same row could
 * therefore be split differently depending on which path created it.
 */
import type { Participant, Beneficiary } from '../types';

/** Payee values meaning "the whole group". */
const GROUP_PAYEE_VALUES = new Set(['گروه', 'همه', 'all', 'هر نفر']);

/** Payee values meaning "only the payer". */
const PERSONAL_PAYEE_VALUES = new Set(['هزینه شخصی']);

export function makeBeneficiary(participantId: string): Beneficiary {
  return { participantId, customAmount: null, customPercentage: null };
}

export function resolveParticipantId(name: string, lookup: Map<string, string>): string | null {
  if (!name) return null;
  return lookup.get(name.trim().toLowerCase()) ?? null;
}

export interface ResolveBeneficiariesInput {
  payeeName: string;
  entryType: string;
  payerId: string;
  allParticipants: Participant[];
  lookup: Map<string, string>;
  tankhahParticipantId?: string;
}

/**
 * Resolves the beneficiary list for a row. Returns an empty array when the
 * payee cannot be resolved — callers must treat that as a failure rather than
 * defaulting to the whole group.
 */
export function resolveBeneficiaries(input: ResolveBeneficiariesInput): Beneficiary[] {
  const { payeeName, entryType, payerId, allParticipants, lookup, tankhahParticipantId } = input;

  const groupParticipants = tankhahParticipantId
    ? allParticipants.filter(p => p.id !== tankhahParticipantId)
    : allParticipants;

  const payee = payeeName.trim();
  const payeeLower = payee.toLowerCase();

  if (
    GROUP_PAYEE_VALUES.has(payeeLower) ||
    entryType === 'expense_group' ||
    entryType === 'expense_from_tankhah' ||
    entryType === 'expense_treat'
  ) {
    return groupParticipants.map(p => makeBeneficiary(p.id));
  }

  if (PERSONAL_PAYEE_VALUES.has(payee)) {
    return [makeBeneficiary(payerId)];
  }

  // A personal expense benefits the payer only when no payee is named;
  // "personal, paid by Alice for Bob" still benefits Bob.
  if (entryType === 'expense_personal' && !payee) {
    return [makeBeneficiary(payerId)];
  }

  if (!payee) {
    return groupParticipants.map(p => makeBeneficiary(p.id));
  }

  if (payee.includes('|')) {
    const ids: string[] = [];
    for (const name of payee.split('|')) {
      const id = resolveParticipantId(name, lookup);
      if (id) ids.push(id);
    }
    return ids.length > 0 ? ids.map(makeBeneficiary) : [];
  }

  const payeeId = resolveParticipantId(payee, lookup);
  if (payeeId) return [makeBeneficiary(payeeId)];

  return [];
}

/** Builds the name -> id lookup used by every import path. */
export function buildParticipantLookup(participants: Participant[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const p of participants) {
    lookup.set(p.name.trim().toLowerCase(), p.id);
  }
  return lookup;
}
