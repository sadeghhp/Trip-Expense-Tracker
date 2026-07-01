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
import { parseFlexibleDate } from './csv-transformer';

export { parseFlexibleDate };

export const SWAPPED_ENTRY_TYPES = new Set(['debt_statement']);
export const SKIP_ENTRY_TYPES = new Set(['currency_exchange', 'fund_opening']);
export const INTERNAL_SKIP_TYPES = new Set([
  'cash_transfer', 'withdrawal', 'advance_received',
  'loan_disbursement', 'allowance_grant', 'debt_statement'
]);

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
  enrichedDescription?: string;
}

export interface ApplyResult {
  success: boolean;
  expense?: Expense;
  error?: string;
  journalPatch?: Partial<JournalEntry>;
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.\-,]/g, '').replace(/,(?=\d{3})/g, '');
  return parseFloat(cleaned) || 0;
}

function makeBeneficiary(pid: string): Beneficiary {
  return { participantId: pid, customAmount: null, customPercentage: null };
}

export function resolveParticipantId(
  name: string,
  lookup: Map<string, string>
): string | null {
  if (!name) return null;
  return lookup.get(name.toLowerCase()) ?? null;
}

export function resolveBeneficiaries(
  payeeName: string,
  entryType: string,
  payerId: string,
  allParticipants: Participant[],
  lookup: Map<string, string>,
  tankhahParticipantId?: string
): Beneficiary[] {
  const groupParticipants = tankhahParticipantId
    ? allParticipants.filter(p => p.id !== tankhahParticipantId)
    : allParticipants;

  const payeeLower = payeeName.toLowerCase();
  if (payeeLower === 'گروه' || payeeLower === 'همه' || payeeLower === 'all'
      || entryType === 'expense_group' || entryType === 'expense_from_tankhah' || entryType === 'expense_treat') {
    return groupParticipants.map(p => makeBeneficiary(p.id));
  }

  if (payeeName === 'هزینه شخصی' || entryType === 'expense_personal') {
    return [makeBeneficiary(payerId)];
  }

  if (entryType === 'expense_personal' && !payeeName) {
    return [makeBeneficiary(payerId)];
  }

  const TRANSFER_TYPES = ['withdrawal', 'cash_transfer', 'advance_received', 'loan_disbursement', 'allowance_grant'];
  if (TRANSFER_TYPES.includes(entryType)) {
    if (payeeName === 'all' || payeeName === 'همه') {
      return groupParticipants.map(p => makeBeneficiary(p.id));
    }
    const payeeId = resolveParticipantId(payeeName, lookup);
    if (payeeId) return [makeBeneficiary(payeeId)];
    return [];
  }

  if (!payeeName) {
    return groupParticipants.map(p => makeBeneficiary(p.id));
  }

  if (payeeName.includes('|')) {
    const names = payeeName.split('|').map(n => n.trim());
    const ids: string[] = [];
    for (const n of names) {
      const id = resolveParticipantId(n, lookup);
      if (id) ids.push(id);
    }
    return ids.length > 0 ? ids.map(makeBeneficiary) : [];
  }

  const payeeId = resolveParticipantId(payeeName, lookup);
  if (payeeId) {
    return [makeBeneficiary(payeeId)];
  }

  return [];
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
  const isSwapped = mapping.entryType ? SWAPPED_ENTRY_TYPES.has(entryType) : false;

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
    journalId: fields.journalId ?? existing?.journalId ?? null,
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

export function validateJournalEntryFields(
  entry: JournalEntry,
  currencyCodes: Set<string>
): string | null {
  if (SKIP_ENTRY_TYPES.has(entry.entryType)) {
    return `Non-importable entry type: ${entry.entryType}`;
  }

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

  if (entry.amount <= 0) {
    return 'Invalid amount';
  }

  if (entry.payerName && entry.payeeName
      && entry.payerName.toLowerCase() === entry.payeeName.toLowerCase()
      && INTERNAL_SKIP_TYPES.has(entry.entryType)) {
    return 'Internal transfer (same payer and payee)';
  }

  return null;
}

export function transformJournalEntry(
  entry: JournalEntry,
  context: TransformContext
): TransformResult {
  const currencyCodes = new Set(context.currencies.map(c => c.code));
  const fieldError = validateJournalEntryFields(entry, currencyCodes);
  if (fieldError) {
    return { expense: null, error: fieldError };
  }

  const { participants, participantLookup, descriptionNames, tankhahParticipantId } = context;
  const payerId = resolveParticipantId(entry.payerName, participantLookup);
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
    beneficiaries = resolveBeneficiaries(
      entry.payeeName,
      entry.entryType,
      payerId,
      participants,
      participantLookup,
      tankhahParticipantId
    );
  }

  if (beneficiaries.length === 0) {
    return { expense: null, error: 'Could not determine beneficiaries' };
  }

  const expenseId = context.existingExpenseId ?? generateId();
  const existing = context.existingExpense;
  const isTreatEntry = entry.entryType === 'expense_treat';

  const expense: Expense = {
    id: expenseId,
    date: entry.date,
    description: enrichedDescription || (context.rowNum ? `Row ${context.rowNum}` : entry.description || 'Journal entry'),
    currencyCode: entry.currencyCode,
    amount: entry.amount,
    paidBy: payerId,
    splitType: 'equal',
    beneficiaries,
    source: 'journal',
    journalEntryId: context.journalEntryId,
    ...(isTreatEntry ? { isTreat: true } : {}),
    ...(existing?.source !== 'journal' && existing?.receiptImageId !== undefined && { receiptImageId: existing.receiptImageId }),
    ...(existing?.source !== 'journal' && existing?.aiMetadata !== undefined && { aiMetadata: existing.aiMetadata })
  };

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
  return new Set((data.descriptionPayeeNames ?? []).map(n => n.toLowerCase()));
}

export function applyJournalEntryLogic(
  entry: JournalEntry,
  data: AppData,
  context: TransformContext,
  options?: { force?: boolean }
): ApplyResult {
  if (entry.status === 'out_of_sync' && !options?.force) {
    return {
      success: false,
      error: 'out_of_sync',
      journalPatch: {}
    };
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
    status: 'pending',
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
  if (audit.status === 'imported' || audit.status === 'flagged') {
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
  importBatchId?: string
): JournalEntry[] {
  const byJournalId = new Map(
    existingJournals
      .filter(j => j.journalId)
      .map(j => [j.journalId!, j])
  );

  return auditEntries.map(audit => {
    const existing = audit.journalId ? byJournalId.get(audit.journalId) : undefined;
    const rawData = rawDataByJournalId.get(audit.journalId)
      ?? (existing?.rawData && Object.keys(existing.rawData).length > 0 ? existing.rawData : {});
    return csvAuditToActionableJournal(
      audit,
      rawData,
      audit.linkedExpenseId,
      importBatchId,
      existing?.id
    );
  });
}

export function mergeActionableJournals(
  existing: JournalEntry[],
  incoming: JournalEntry[]
): JournalEntry[] {
  const byJournalId = new Map(
    existing.filter(j => j.journalId).map(j => [j.journalId!, j])
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
