import type {
  AppData,
  Expense,
  JournalEntry,
  JournalStatus,
  CsvJournalEntry,
  Participant,
  Currency,
  Beneficiary
} from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { validateExpense } from './validation';
import { generateId } from './id';
import { parseFlexibleDate, parseNumber, journalIdForRow } from './csv-transformer';
import {
  isExpenseEntryType,
  nonExpenseReason,
  isTreatEntryType,
  isSwappedEntryType,
  isInternalWhenSelf,
  NON_EXPENSE_ENTRY_TYPES,
  INTERNAL_WHEN_SELF_ENTRY_TYPES,
  SWAPPED_ENTRY_TYPES
} from '../domain/entry-types';
import {
  resolveBeneficiaries as resolveBeneficiariesShared,
  resolveParticipantId as resolveParticipantIdShared,
  makeBeneficiary,
  buildParticipantLookup
} from '../domain/beneficiaries';
import { linkExpenseToJournal } from '../domain/journal-link';

export { parseFlexibleDate, buildParticipantLookup };

/** Re-exported for backward compatibility; the policy lives in domain/entry-types. */
export { SWAPPED_ENTRY_TYPES };
export const SKIP_ENTRY_TYPES = NON_EXPENSE_ENTRY_TYPES;
export const INTERNAL_SKIP_TYPES = INTERNAL_WHEN_SELF_ENTRY_TYPES;

export interface TransformContext {
  participants: Participant[];
  currencies: Currency[];
  participantLookup: Map<string, string>;
  descriptionNames: Set<string>;
  tankhahParticipantId?: string;
  existingExpenseId?: string;
  existingExpense?: Expense;
  journalEntryId: string;
  rowNum?: number;
}

export interface TransformResult {
  expense: Expense | null;
  error: string | null;
  /** Set when the row may never become an expense (non-expense ledger movement). */
  excluded?: boolean;
  enrichedDescription?: string;
}

export interface ApplyResult {
  success: boolean;
  expense?: Expense;
  error?: string;
  journalPatch?: Partial<JournalEntry>;
}

export function resolveParticipantId(name: string, lookup: Map<string, string>): string | null {
  return resolveParticipantIdShared(name, lookup);
}

export function resolveBeneficiaries(
  payeeName: string,
  entryType: string,
  payerId: string,
  allParticipants: Participant[],
  lookup: Map<string, string>,
  tankhahParticipantId?: string
): Beneficiary[] {
  return resolveBeneficiariesShared({
    payeeName,
    entryType,
    payerId,
    allParticipants,
    lookup,
    tankhahParticipantId
  });
}

export function extractFieldsFromCsvRow(
  row: CsvRow,
  mapping: ColumnMapping,
  rowNum: number
): {
  journalId: string | null;
  entryType: string;
  description: string;
  currency: string;
  date: string | null;
  amount: number;
  payerName: string;
  payeeName: string;
  notes: string;
  flag: string;
  isSwapped: boolean;
} {
  const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
  const isSwapped = mapping.entryType ? isSwappedEntryType(entryType) : false;

  let payerName = mapping.payer ? row[mapping.payer].trim() : '';
  let payeeName = mapping.payee ? row[mapping.payee].trim() : '';
  if (isSwapped) {
    [payerName, payeeName] = [payeeName, payerName];
  }

  const rawDate = mapping.date ? row[mapping.date] : '';
  const rawAmount = mapping.amount ? row[mapping.amount] : '0';
  const amount = Math.round(Math.abs(parseNumber(rawAmount)) * 100) / 100;

  return {
    journalId: mapping.id ? row[mapping.id].trim() || null : null,
    entryType,
    description: mapping.description ? row[mapping.description].trim() : '',
    currency: mapping.currency ? row[mapping.currency].trim().toUpperCase() : '',
    date: parseFlexibleDate(rawDate),
    amount,
    payerName,
    payeeName,
    notes: mapping.notes ? row[mapping.notes].trim() : '',
    flag: mapping.flag ? row[mapping.flag].trim() : '',
    isSwapped
  };
}

export function buildJournalEntryFromCsvRow(
  row: CsvRow,
  mapping: ColumnMapping,
  rowNum: number,
  importBatchId?: string,
  existing?: JournalEntry
): JournalEntry {
  const fields = extractFieldsFromCsvRow(row, mapping, rowNum);
  const now = new Date().toISOString();

  return {
    id: existing?.id ?? generateId(),
    journalId: fields.journalId ?? existing?.journalId ?? journalIdForRow(row, mapping, rowNum),
    rawData: { ...row },
    date: fields.date ?? existing?.date ?? '',
    description: fields.description,
    amount: fields.amount,
    currencyCode: fields.currency,
    payerName: fields.payerName,
    payeeName: fields.payeeName,
    entryType: fields.entryType,
    notes: fields.notes || undefined,
    flag: fields.flag || undefined,
    status: existing?.status ?? 'pending',
    skipReason: existing?.skipReason,
    expenseId: existing?.expenseId ?? null,
    importBatchId: importBatchId ?? existing?.importBatchId,
    updatedAt: now
  };
}

/**
 * Field-level validation. The entry-type gate comes first and is shared with
 * the CSV import path, so a withdrawal can never be turned into an expense by
 * Apply / Apply All.
 */
export function validateJournalEntryFields(
  entry: JournalEntry,
  currencyCodes: Set<string>
): string | null {
  const excluded = nonExpenseReason(entry.entryType);
  if (excluded) return excluded;

  if (entry.description.includes('تکرار ثبت')) {
    return 'Duplicate entry (تکرار ثبت)';
  }

  if (!entry.currencyCode || entry.currencyCode === 'UNKNOWN') {
    return 'Unknown or missing currency';
  }

  if (!currencyCodes.has(entry.currencyCode)) {
    return `Currency ${entry.currencyCode} not configured`;
  }

  if (!entry.date) {
    return 'Invalid date';
  }

  if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
    return 'Invalid amount';
  }

  // Only internal-transfer-like types treat payer == payee as a no-op; a
  // plain expense where someone pays for themselves is legitimate. (Widening
  // this to all types silently broke import/apply parity: the CSV import
  // created such expenses and Apply then refused the very same rows.)
  if (
    entry.payerName &&
    entry.payeeName &&
    entry.payerName.toLowerCase() === entry.payeeName.toLowerCase() &&
    isInternalWhenSelf(entry.entryType)
  ) {
    return 'Internal transfer (same payer and payee)';
  }

  return null;
}

export function transformJournalEntry(
  entry: JournalEntry,
  context: TransformContext
): TransformResult {
  const excluded = nonExpenseReason(entry.entryType);
  if (excluded) {
    return { expense: null, error: excluded, excluded: true };
  }

  const currencyCodes = new Set(context.currencies.map(c => c.code));
  const fieldError = validateJournalEntryFields(entry, currencyCodes);
  if (fieldError) {
    return { expense: null, error: fieldError };
  }

  const { participants, participantLookup, descriptionNames, tankhahParticipantId } = context;
  const payerId = resolveParticipantIdShared(entry.payerName, participantLookup);
  if (!payerId) {
    const reason = entry.payerName
      ? `Unknown payer: ${entry.payerName}`
      : 'No payer column mapped or payer is empty';
    return { expense: null, error: reason };
  }

  const payeeIsDescription = entry.payeeName
    ? descriptionNames.has(entry.payeeName.toLowerCase())
    : false;

  let beneficiaries: Beneficiary[];
  let enrichedDescription = entry.description;

  const groupParticipants = tankhahParticipantId
    ? participants.filter(p => p.id !== tankhahParticipantId)
    : participants;

  if (payeeIsDescription) {
    beneficiaries = groupParticipants.map(p => makeBeneficiary(p.id));
    if (entry.payeeName && !entry.description.includes(entry.payeeName)) {
      enrichedDescription = entry.description
        ? `${entry.description} - ${entry.payeeName}`
        : entry.payeeName;
    }
  } else {
    beneficiaries = resolveBeneficiariesShared({
      payeeName: entry.payeeName,
      entryType: entry.entryType,
      payerId,
      allParticipants: participants,
      lookup: participantLookup,
      tankhahParticipantId
    });
  }

  if (beneficiaries.length === 0) {
    return { expense: null, error: 'Could not determine beneficiaries' };
  }

  const expenseId = context.existingExpenseId ?? generateId();
  const existing = context.existingExpense;

  const expense: Expense = linkExpenseToJournal(
    {
      id: expenseId,
      date: entry.date,
      description:
        enrichedDescription || (context.rowNum ? `Row ${context.rowNum}` : entry.description || 'Journal entry'),
      currencyCode: entry.currencyCode,
      amount: entry.amount,
      paidBy: payerId,
      splitType: 'equal',
      beneficiaries,
      ...(isTreatEntryType(entry.entryType) ? { isTreat: true } : {}),
      // Receipt/AI attachments belong to the expense, not to the journal, so a
      // re-apply must never drop them. (They were lost on the second apply,
      // because the first apply had already set source to 'journal'.)
      ...(existing?.receiptImageId !== undefined && { receiptImageId: existing.receiptImageId }),
      ...(existing?.aiMetadata !== undefined && { aiMetadata: existing.aiMetadata })
    },
    context.journalEntryId
  );

  return { expense, error: null, enrichedDescription };
}

export function buildTransformContext(
  data: AppData,
  participantLookup: Map<string, string>,
  descriptionNames: Set<string>,
  journalEntryId: string,
  existingExpenseId?: string,
  rowNum?: number
): TransformContext {
  const existingExpense = existingExpenseId
    ? data.expenses.find(e => e.id === existingExpenseId)
    : undefined;

  return {
    participants: data.participants,
    currencies: data.currencies,
    participantLookup,
    descriptionNames,
    tankhahParticipantId: data.tankhahParticipantId,
    existingExpenseId,
    existingExpense,
    journalEntryId,
    rowNum
  };
}

export function descriptionNamesFromData(data: AppData): Set<string> {
  return new Set((data.descriptionPayeeNames ?? []).map(n => n.trim().toLowerCase()));
}

export function applyJournalEntryLogic(
  entry: JournalEntry,
  data: AppData,
  context: TransformContext,
  options?: { force?: boolean }
): ApplyResult {
  // Terminal: a non-expense ledger movement is never applied, not even forced.
  if (entry.status === 'excluded' || nonExpenseReason(entry.entryType)) {
    const reason = nonExpenseReason(entry.entryType) ?? 'Non-expense entry';
    return {
      success: false,
      error: reason,
      journalPatch: {
        status: 'excluded' as JournalStatus,
        skipReason: reason,
        updatedAt: new Date().toISOString()
      }
    };
  }

  if (entry.status === 'out_of_sync' && !options?.force) {
    return { success: false, error: 'out_of_sync', journalPatch: {} };
  }

  const { expense, error } = transformJournalEntry(entry, context);
  if (error || !expense) {
    return {
      success: false,
      error: error ?? 'Transform failed',
      journalPatch: {
        status: 'error' as JournalStatus,
        skipReason: error ?? 'Transform failed',
        updatedAt: new Date().toISOString()
      }
    };
  }

  const validationError = validateExpense(expense, data);
  if (validationError) {
    return {
      success: false,
      error: validationError.key,
      journalPatch: {
        status: 'error' as JournalStatus,
        skipReason: validationError.key,
        updatedAt: new Date().toISOString()
      }
    };
  }

  return {
    success: true,
    expense,
    journalPatch: {
      status: 'applied' as JournalStatus,
      expenseId: expense.id,
      skipReason: undefined,
      updatedAt: new Date().toISOString()
    }
  };
}

export function pendingImportToJournal(item: {
  id: string;
  rawData: Record<string, string>;
  reason: string;
  date?: string;
  description?: string;
  amount?: number;
  currencyCode?: string;
  payerName?: string;
  payeeName?: string;
  entryType?: string;
}): JournalEntry {
  return {
    id: item.id,
    journalId: null,
    rawData: item.rawData,
    date: item.date ?? '',
    description: item.description ?? '',
    amount: item.amount ?? 0,
    currencyCode: item.currencyCode ?? '',
    payerName: item.payerName ?? '',
    payeeName: item.payeeName ?? '',
    entryType: item.entryType ?? '',
    status: isExpenseEntryType(item.entryType) ? 'pending' : 'excluded',
    skipReason: item.reason,
    expenseId: null,
    updatedAt: new Date().toISOString()
  };
}

export function csvAuditToActionableJournal(
  audit: CsvJournalEntry,
  rawData: Record<string, string>,
  expenseId: string | null,
  importBatchId?: string,
  existingId?: string
): JournalEntry {
  let status: JournalStatus;
  if (nonExpenseReason(audit.entryType)) {
    status = 'excluded';
  } else if (audit.status === 'imported' || audit.status === 'flagged') {
    status = 'applied';
  } else if (audit.skipReason) {
    status = 'error';
  } else {
    status = 'pending';
  }

  return {
    id: existingId ?? generateId(),
    journalId: audit.journalId,
    rawData,
    date: audit.date,
    description: audit.description,
    amount: audit.amount,
    currencyCode: audit.currency,
    payerName: audit.payer,
    payeeName: audit.payee,
    entryType: audit.entryType,
    notes: audit.notes || undefined,
    flag: audit.flag || undefined,
    status,
    skipReason: audit.skipReason || undefined,
    expenseId: expenseId ?? audit.linkedExpenseId,
    importBatchId,
    updatedAt: new Date().toISOString()
  };
}

export function buildActionableJournalsFromImport(
  auditEntries: CsvJournalEntry[],
  rawDataByJournalId: Map<string, Record<string, string>>,
  existingJournals: JournalEntry[] = [],
  importBatchId?: string,
  /**
   * Ids the transform already linked its expenses to. Without these the
   * builder mints its own ids and every expense.journalEntryId dangles.
   */
  actionableIdByJournalId?: Map<string, string>
): JournalEntry[] {
  const byJournalId = new Map(
    existingJournals.filter(j => j.journalId).map(j => [j.journalId as string, j])
  );

  return auditEntries.map(audit => {
    const existing = audit.journalId ? byJournalId.get(audit.journalId) : undefined;
    const rawData =
      rawDataByJournalId.get(audit.journalId) ??
      (existing?.rawData && Object.keys(existing.rawData).length > 0 ? existing.rawData : {});
    const linkedId = actionableIdByJournalId?.get(audit.journalId) ?? existing?.id;
    const journal = csvAuditToActionableJournal(
      audit,
      rawData,
      audit.linkedExpenseId,
      importBatchId,
      linkedId
    );
    // Preserve a local out_of_sync marker: the user edited the expense and the
    // re-import deliberately left it alone.
    if (existing?.status === 'out_of_sync' && journal.expenseId === existing.expenseId) {
      return { ...journal, status: 'out_of_sync' as JournalStatus };
    }
    return journal;
  });
}

export function mergeActionableJournals(
  existing: JournalEntry[],
  incoming: JournalEntry[]
): JournalEntry[] {
  const byJournalId = new Map(
    existing.filter(j => j.journalId).map(j => [j.journalId as string, j])
  );
  const byId = new Map(existing.map(j => [j.id, j]));

  for (const entry of incoming) {
    const match = entry.journalId ? byJournalId.get(entry.journalId) : undefined;
    if (match) {
      byId.set(match.id, {
        ...entry,
        id: match.id,
        rawData: Object.keys(entry.rawData).length > 0 ? entry.rawData : match.rawData
      });
    } else {
      byId.set(entry.id, entry);
      if (entry.journalId) byJournalId.set(entry.journalId, entry);
    }
  }

  return [...byId.values()];
}
