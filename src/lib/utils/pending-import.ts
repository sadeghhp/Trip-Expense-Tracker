import type { Expense, Participant, Currency, PendingImportItem, CsvJournalEntry } from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { generateId } from './id';
import { journalIdForRow } from './csv-transformer';
import { isExpenseEntryType } from '../domain/entry-types';

/**
 * Builds the expense a pending item should be pre-filled with.
 *
 * The id is a real generated id: an empty id made `ExpenseForm` take its edit
 * path, match no stored expense, and silently drop the record while the wizard
 * reported success.
 *
 * The payer is left empty when the CSV name could not be resolved, so the user
 * must choose one. Defaulting to `participants[0]` silently booked expenses
 * against whoever happened to be first in the list.
 */
export function buildExpenseFromPendingItem(
  item: PendingImportItem,
  participants: Participant[],
  currencies: Currency[],
  tankhahParticipantId?: string
): Expense {
  const payerId = item.payerName
    ? participants.find(p => p.name.trim().toLowerCase() === item.payerName!.trim().toLowerCase())?.id
    : undefined;

  const groupParticipants = tankhahParticipantId
    ? participants.filter(p => p.id !== tankhahParticipantId)
    : participants;

  return {
    id: generateId(),
    date: item.date ?? '',
    description: item.description ?? '',
    currencyCode: item.currencyCode ?? currencies[0]?.code ?? '',
    amount: item.amount ?? 0,
    paidBy: payerId ?? '',
    splitType: 'equal',
    beneficiaries: groupParticipants.map(p => ({
      participantId: p.id,
      customAmount: null,
      customPercentage: null
    })),
    ...(item.entryType === 'expense_treat' ? { isTreat: true } : {})
  };
}

export function buildRawDataByJournalId(
  rows: CsvRow[],
  mapping: ColumnMapping
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const journalId = journalIdForRow(rows[i], mapping, rowNum);
    map.set(journalId, { ...rows[i] });
  }
  return map;
}

/**
 * Builds review items for rows that failed to import.
 *
 * Rows excluded by the entry-type policy are not offered for review: they are
 * transfers/withdrawals that must never become expenses, and pre-filling them
 * as ordinary shared expenses invited exactly that.
 *
 * Items are keyed by `journalId` and de-duplicated against what is already
 * queued, so re-importing a file cannot enqueue the same row twice.
 */
export function buildPendingItemsFromJournalEntries(
  rows: CsvRow[],
  entries: CsvJournalEntry[],
  mapping: ColumnMapping,
  existingItems: PendingImportItem[] = []
): PendingImportItem[] {
  const rawById = buildRawDataByJournalId(rows, mapping);
  const now = new Date().toISOString();
  const items: PendingImportItem[] = [];

  const alreadyQueued = new Set(
    existingItems.map(item => item.journalId).filter((id): id is string => !!id)
  );

  for (const entry of entries) {
    if (entry.status !== 'skipped' || !entry.skipReason) continue;
    if (!isExpenseEntryType(entry.entryType)) continue;
    if (alreadyQueued.has(entry.journalId)) continue;
    alreadyQueued.add(entry.journalId);

    items.push({
      id: generateId(),
      journalId: entry.journalId,
      rawData: rawById.get(entry.journalId) ?? {},
      reason: entry.skipReason,
      createdAt: now,
      date: entry.date || undefined,
      description: entry.description || undefined,
      amount: entry.amount > 0 ? entry.amount : undefined,
      currencyCode: entry.currency || undefined,
      payerName: entry.payer || undefined,
      payeeName: entry.payee || undefined,
      entryType: entry.entryType || undefined
    });
  }

  return items;
}

/**
 * The description-payee decisions that must be persisted so that a later
 * re-apply resolves beneficiaries exactly as the original import did.
 *
 * Callers must pass the same merged mapping list they handed to the transform;
 * passing the step-3 list alone always yielded an empty result because those
 * entries carry `isDescription: false`.
 */
export function extractDescriptionPayeeNames(
  participantMappings: { csvName: string; isDescription: boolean }[]
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const pm of participantMappings) {
    if (!pm.isDescription) continue;
    const key = pm.csvName.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(pm.csvName);
  }
  return names;
}
