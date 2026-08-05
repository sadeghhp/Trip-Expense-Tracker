import type { Expense, Participant, Currency, Beneficiary, CsvJournalEntry, JournalEntry } from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { generateId } from './id';
import { getTodayISO } from '../engine/calendar';
import {
  isExpenseEntryType,
  nonExpenseReason,
  isTreatEntryType,
  isSwappedEntryType,
  isInternalWhenSelf,
  classifyEntryType
} from '../domain/entry-types';
import {
  parseCanonicalDate,
  normalizeDigits,
  inferDateOrder,
  type DayFirstPreference,
  type DateFailureReason
} from '../domain/dates';
import {
  resolveBeneficiaries as resolveBeneficiariesShared,
  resolveParticipantId as resolveParticipantIdShared,
  makeBeneficiary
} from '../domain/beneficiaries';

export interface ImportResult {
  expenses: Expense[];
  journalEntries: CsvJournalEntry[];
  newParticipants: { name: string; id: string }[];
  newCurrencies: { code: string; symbol: string }[];
  skippedRows: { row: number; reason: string }[];
  flaggedRows: { row: number; flag: string; notes: string }[];
  /** Per-row reconciliation outcome, for accurate import summaries. */
  outcomes: ImportRowOutcome[];
}

export type ImportRowStatus =
  | 'added'
  | 'updated'
  | 'unchanged'
  | 'skipped'
  | 'excluded';

export interface ImportRowOutcome {
  rowNum: number;
  journalId: string;
  /** Stable id of the actionable journal for this source row. */
  actionableJournalId: string;
  status: ImportRowStatus;
  expenseId: string | null;
  reason?: string;
}

export interface AmbiguousPayee {
  name: string;
  occurrences: number;
  sampleEntryType: string;
  sampleAmount: string;
  sampleCurrency: string;
}

export interface ExtractedNames {
  confirmed: string[];
  ambiguous: AmbiguousPayee[];
}

export interface ParticipantMapping {
  csvName: string;
  participantId: string | null;
  createNew: boolean;
  isDescription: boolean;
}

/**
 * Prior state that makes re-import idempotent: stable journal identity plus the
 * expense a journal row already created.
 */
export interface ImportReconciliation {
  /** journalId -> existing actionable journal. */
  existingJournalsByJournalId: Map<string, JournalEntry>;
  /** Expense ids currently present in the store. */
  existingExpenseIds: Set<string>;
}

export function emptyReconciliation(): ImportReconciliation {
  return { existingJournalsByJournalId: new Map(), existingExpenseIds: new Set() };
}

/**
 * Builds reconciliation state from stored data.
 */
export function buildReconciliation(
  journals: JournalEntry[],
  expenses: { id: string }[]
): ImportReconciliation {
  const existingJournalsByJournalId = new Map<string, JournalEntry>();
  for (const journal of journals) {
    if (journal.journalId) existingJournalsByJournalId.set(journal.journalId, journal);
  }
  return {
    existingJournalsByJournalId,
    existingExpenseIds: new Set(expenses.map(e => e.id))
  };
}

const SKIP_PAYEE_VALUES = new Set(['هزینه شخصی', 'گروه', 'همه', 'موجودی اولیه سفر', 'هر نفر']);

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  KRW: '₩', INR: '₹', IRR: '﷼', TRY: '₺', RUB: '₽',
  AED: 'د.إ', SAR: '﷼', CAD: 'C$', AUD: 'A$', CHF: 'Fr',
  SEK: 'kr', THB: '฿', MYR: 'RM', BRL: 'R$', MXN: 'Mex$',
  GEL: '₾', AMD: '֏', IQD: 'ع.د', PKR: '₨'
};

export type DateFormat = DayFirstPreference;

const DATE_ERROR_MESSAGES: Record<DateFailureReason, string> = {
  empty: 'Invalid date: missing',
  unparseable: 'Invalid date: unrecognized format',
  impossible: 'Invalid date: does not exist in the calendar',
  ambiguous_calendar: 'Invalid date: ambiguous — choose the date format explicitly',
  year_out_of_range: 'Invalid date: year outside the supported range'
};

export function describeDateFailure(reason: DateFailureReason, raw: string): string {
  return `${DATE_ERROR_MESSAGES[reason]}: "${raw}"`;
}

/**
 * Parses a raw date cell into a canonical Gregorian ISO date.
 * Jalali input is converted here, at the ingestion boundary.
 */
export function parseFlexibleDate(raw: string, format: DateFormat = 'auto'): string | null {
  const result = parseCanonicalDate(raw, { order: format });
  return result.ok ? result.date : null;
}

/** Same parse, but keeps the failure reason so imports can explain themselves. */
export function parseImportDate(raw: string, format: DateFormat = 'auto') {
  return parseCanonicalDate(raw, { order: format });
}

/**
 * Parses an amount cell. Handles thousands/decimal separators in both the
 * `1,234.56` and `1.234,56` conventions plus Persian/Arabic-Indic digits,
 * which previously parsed to 0 and silently dropped whole Persian files.
 */
export function parseNumber(raw: string): number {
  let cleaned = normalizeDigits(String(raw ?? ''))
    .replace(/[٬٫]/g, m => (m === '٬' ? ',' : '.'))
    .replace(/[^\d.\-,]/g, '');
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    if (/,\d{3}$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  }

  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function matchesKnownPayer(name: string, payers: Set<string>): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  for (const payer of payers) {
    if (payer.toLowerCase() === lower) return true;
  }
  return false;
}

export function extractUniqueNames(rows: CsvRow[], mapping: ColumnMapping): ExtractedNames {
  const payerNames = new Map<string, string>();

  for (const row of rows) {
    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && !isExpenseEntryType(entryType)) continue;

    const payer = mapping.payer ? row[mapping.payer].trim() : '';
    if (!payer) continue;
    const names = payer.includes('|') ? payer.split('|').map(n => n.trim()).filter(Boolean) : [payer];
    for (const name of names) {
      // Case-insensitive identity: "ali" and "Ali" are one person, otherwise
      // the import creates a second, permanently orphaned participant.
      const key = name.toLowerCase();
      if (!payerNames.has(key)) payerNames.set(key, name);
    }
  }

  const knownPayers = new Set(payerNames.values());
  const ambiguousMap = new Map<string, AmbiguousPayee>();

  for (const row of rows) {
    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && !isExpenseEntryType(entryType)) continue;
    if (entryType === 'expense_personal') continue;

    const payee = mapping.payee ? row[mapping.payee].trim() : '';
    if (!payee || SKIP_PAYEE_VALUES.has(payee)) continue;

    const names = payee.includes('|') ? payee.split('|').map(n => n.trim()).filter(Boolean) : [payee];

    for (const name of names) {
      if (matchesKnownPayer(name, knownPayers)) continue;
      if (SKIP_PAYEE_VALUES.has(name)) continue;

      const key = name.toLowerCase();
      const existing = ambiguousMap.get(key);
      if (existing) {
        existing.occurrences++;
      } else {
        ambiguousMap.set(key, {
          name,
          occurrences: 1,
          sampleEntryType: entryType,
          sampleAmount: mapping.amount ? row[mapping.amount].trim() : '',
          sampleCurrency: mapping.currency ? row[mapping.currency].trim() : ''
        });
      }
    }
  }

  return {
    confirmed: Array.from(knownPayers).sort(),
    ambiguous: Array.from(ambiguousMap.values())
  };
}

export function extractUniqueCurrencies(rows: CsvRow[], mapping: ColumnMapping): string[] {
  const codes = new Set<string>();

  for (const row of rows) {
    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && !isExpenseEntryType(entryType)) continue;

    const currency = mapping.currency ? row[mapping.currency].trim().toUpperCase() : '';
    if (currency && currency !== 'UNKNOWN') {
      codes.add(currency);
    }
  }

  return Array.from(codes).sort();
}

export function getSymbolForCurrency(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** Stable source identity for a row. */
export function journalIdForRow(row: CsvRow, mapping: ColumnMapping, rowNum: number): string {
  const mapped = mapping.id ? row[mapping.id]?.trim() : '';
  return mapped || `row-${rowNum}`;
}

const TREAT_FALSE_VALUES = new Set(['', '0', 'false', 'no', 'n', 'خیر']);

/** A treat column marks the row when it holds any value not explicitly falsy. */
export function isTreatMark(raw: string | undefined): boolean {
  return !TREAT_FALSE_VALUES.has((raw ?? '').trim().toLowerCase());
}

/**
 * The row's effective entry type: a truthy treat-column mark promotes an
 * expense row to `expense_treat`, reusing the existing treat plumbing
 * (validation, apply, audit) end-to-end. Non-expense/obligation rows keep
 * their type — a treat mark cannot turn a transfer into a treat.
 */
export function effectiveEntryType(entryType: string, treatMarked: boolean): string {
  if (!treatMarked) return entryType;
  const value = (entryType ?? '').trim();
  if (!value || classifyEntryType(value).kind === 'expense') {
    return 'expense_treat';
  }
  // A treat mark cannot turn a debt/transfer into a treat.
  return entryType;
}

export function transformCsvToExpenses(
  rows: CsvRow[],
  mapping: ColumnMapping,
  participantMappings: ParticipantMapping[],
  existingParticipants: Participant[],
  existingCurrencies: Currency[],
  newCurrencies: { code: string; symbol: string }[],
  dateFormat: DateFormat = 'auto',
  tankhahParticipantId?: string,
  reconciliation: ImportReconciliation = emptyReconciliation()
): ImportResult {
  const result: ImportResult = {
    expenses: [],
    journalEntries: [],
    newParticipants: [],
    newCurrencies: [...newCurrencies],
    skippedRows: [],
    flaggedRows: [],
    outcomes: []
  };

  const allParticipants = [...existingParticipants];
  const participantLookup = new Map<string, string>();
  const descriptionNames = new Set<string>();

  for (const existing of existingParticipants) {
    participantLookup.set(existing.name.trim().toLowerCase(), existing.id);
  }

  for (const pm of participantMappings) {
    const key = pm.csvName.trim().toLowerCase();
    if (pm.isDescription) {
      descriptionNames.add(key);
      continue;
    }
    if (pm.createNew && !pm.participantId) {
      if (participantLookup.has(key)) continue;
      const id = generateId();
      result.newParticipants.push({ name: pm.csvName, id });
      participantLookup.set(key, id);
      allParticipants.push({ id, name: pm.csvName });
    } else if (pm.participantId) {
      participantLookup.set(key, pm.participantId);
    }
  }

  const allCurrencyCodes = new Set([
    ...existingCurrencies.map(c => c.code),
    ...newCurrencies.map(c => c.code)
  ]);

  const seenIds = new Set<string>();

  // Resolve d/m ordering from the whole column before parsing any row, so an
  // 'auto' import disambiguates from evidence instead of assuming US order.
  const effectiveDateFormat: DateFormat =
    dateFormat === 'auto' && mapping.date
      ? inferDateOrder(rows.map(r => r[mapping.date as string] ?? ''))
      : dateFormat;

  const sampleRow = rows[0];
  const sampleHeaders = sampleRow ? Object.keys(sampleRow) : [];
  const entryIdCol = sampleHeaders.find(h => h.toLowerCase().includes('entry_id')) ?? null;
  const sourceFileCol = sampleHeaders.find(h => h.toLowerCase().includes('source_file')) ?? null;
  const localNotesCol = sampleHeaders.find(h =>
    h === 'توضیح' || h === 'local_notes' || h.toLowerCase().replace(/[\s_-]+/g, '') === 'localnotes'
  ) ?? null;

  // A ledger with no date column at all still imports: every row falls back to
  // the import day. (A mapped date column with bad values still fails per row.)
  const fallbackDate = mapping.date ? null : getTodayISO();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const rawEntryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    const treatMarked = mapping.treat ? isTreatMark(row[mapping.treat]) : false;
    const entryType = effectiveEntryType(rawEntryType, treatMarked);
    const description = mapping.description ? row[mapping.description].trim() : '';
    // Debt statements are written debtor -> creditor: the creditor effectively
    // paid and the debtor owes, so the columns are swapped before resolution.
    const swapped = isSwappedEntryType(entryType);
    const rawPayer = mapping.payer ? row[mapping.payer].trim() : '';
    const rawPayee = mapping.payee ? row[mapping.payee].trim() : '';
    const payerName = swapped ? rawPayee : rawPayer;
    const payeeName = swapped ? rawPayer : rawPayee;
    const currency = mapping.currency ? row[mapping.currency].trim().toUpperCase() : '';
    const rawAmount = mapping.amount ? row[mapping.amount] : '0';
    const amount = Math.round(Math.abs(parseNumber(rawAmount)) * 100) / 100;
    const rawDate = mapping.date ? row[mapping.date] : '';
    const dateResult = parseImportDate(rawDate, effectiveDateFormat);
    const date = dateResult.ok ? dateResult.date : fallbackDate;
    const notes = mapping.notes ? row[mapping.notes].trim() : '';
    const flag = mapping.flag ? row[mapping.flag].trim() : '';
    const journalId = journalIdForRow(row, mapping, rowNum);

    const priorJournal = reconciliation.existingJournalsByJournalId.get(journalId);
    const actionableJournalId = priorJournal?.id ?? generateId();
    const priorExpenseId =
      priorJournal?.expenseId && reconciliation.existingExpenseIds.has(priorJournal.expenseId)
        ? priorJournal.expenseId
        : null;

    const journalEntry: CsvJournalEntry = {
      journalId,
      entryId: entryIdCol ? row[entryIdCol].trim() : '',
      sourceFile: sourceFileCol ? row[sourceFileCol].trim() : '',
      entryType: entryType || 'expense',
      date: date || rawDate.trim(),
      description,
      payer: payerName,
      payee: payeeName,
      currency: currency || (mapping.currency ? row[mapping.currency].trim() : ''),
      amount,
      flag,
      notes,
      localNotes: localNotesCol ? (row[localNotesCol]?.trim() ?? '') : '',
      linkedExpenseId: null,
      status: 'skipped',
      skipReason: ''
    };

    const reject = (reason: string, status: ImportRowStatus = 'skipped') => {
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
      result.outcomes.push({
        rowNum,
        journalId,
        actionableJournalId,
        status,
        expenseId: null,
        reason
      });
    };

    // --- Entry-type policy: the single gate for "may this become an expense" ---
    const excludedReason = mapping.entryType ? nonExpenseReason(entryType) : null;
    if (excludedReason) {
      reject(excludedReason, 'excluded');
      continue;
    }

    if (mapping.id) {
      const rowId = row[mapping.id].trim();
      if (rowId && seenIds.has(rowId)) {
        reject(`Duplicate ID: ${rowId}`);
        continue;
      }
      if (rowId) seenIds.add(rowId);
    }

    if (description.includes('تکرار ثبت')) {
      reject('Duplicate entry (تکرار ثبت)');
      continue;
    }

    if (currency === 'UNKNOWN' || !currency) {
      reject('Unknown or missing currency');
      continue;
    }
    if (!allCurrencyCodes.has(currency)) {
      reject(`Currency ${currency} not configured`);
      continue;
    }

    if (!date) {
      reject(
        dateResult.ok ? 'Invalid date' : describeDateFailure(dateResult.reason, rawDate.trim())
      );
      continue;
    }

    if (amount <= 0) {
      reject('Invalid amount');
      continue;
    }

    // A transfer/obligation to oneself is an internal no-op, not a debt.
    // (A plain expense with payer == payee stays legal: own coffee.)
    if (
      payerName &&
      payeeName &&
      payerName.toLowerCase() === payeeName.toLowerCase() &&
      isInternalWhenSelf(entryType)
    ) {
      reject('Internal transfer (same payer and payee)');
      continue;
    }

    const payerId = resolveParticipantIdShared(payerName, participantLookup);
    if (!payerId) {
      reject(payerName ? `Unknown payer: ${payerName}` : 'No payer column mapped or payer is empty');
      continue;
    }

    const payeeIsDescription = payeeName
      ? descriptionNames.has(payeeName.toLowerCase())
      : false;

    let beneficiaries: Beneficiary[];
    let enrichedDescription = description;

    if (payeeIsDescription) {
      const groupParticipants = tankhahParticipantId
        ? allParticipants.filter(p => p.id !== tankhahParticipantId)
        : allParticipants;
      beneficiaries = groupParticipants.map(p => makeBeneficiary(p.id));
      if (payeeName && !description.includes(payeeName)) {
        enrichedDescription = description ? `${description} - ${payeeName}` : payeeName;
      }
    } else {
      beneficiaries = resolveBeneficiariesShared({
        payeeName,
        entryType,
        payerId,
        allParticipants,
        lookup: participantLookup,
        tankhahParticipantId
      });
    }

    if (beneficiaries.length === 0) {
      reject('Could not determine beneficiaries');
      continue;
    }

    if (flag) {
      result.flaggedRows.push({ row: rowNum, flag, notes });
    }

    if (notes && enrichedDescription !== notes) {
      enrichedDescription = enrichedDescription
        ? `${enrichedDescription} - ${notes}`
        : notes;
    }

    // Re-import must not clobber an expense the user has edited: the journal is
    // out_of_sync until they explicitly force-apply.
    const userEdited = priorJournal?.status === 'out_of_sync' && priorExpenseId !== null;
    if (userEdited) {
      journalEntry.linkedExpenseId = priorExpenseId;
      journalEntry.status = flag ? 'flagged' : 'imported';
      result.journalEntries.push(journalEntry);
      result.outcomes.push({
        rowNum,
        journalId,
        actionableJournalId,
        status: 'unchanged',
        expenseId: priorExpenseId,
        reason: 'Expense edited locally; left untouched'
      });
      continue;
    }

    // Reusing the prior expense id is what makes re-import idempotent and keeps
    // every journal/audit link pointing at a record that actually exists.
    const expenseId = priorExpenseId ?? generateId();

    result.expenses.push({
      id: expenseId,
      date,
      description: enrichedDescription || `Row ${rowNum}`,
      currencyCode: currency,
      amount,
      paidBy: payerId,
      splitType: 'equal',
      beneficiaries,
      source: 'journal',
      journalEntryId: actionableJournalId,
      ...(isTreatEntryType(entryType) ? { isTreat: true } : {})
    });

    journalEntry.linkedExpenseId = expenseId;
    journalEntry.status = flag ? 'flagged' : 'imported';
    result.journalEntries.push(journalEntry);
    result.outcomes.push({
      rowNum,
      journalId,
      actionableJournalId,
      status: priorExpenseId ? 'updated' : 'added',
      expenseId
    });
  }

  return result;
}

export interface ImportSummary {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  excluded: number;
  total: number;
}

/**
 * journalId -> the actionable journal id the transform linked its expense to.
 * The journal builder must use these exact ids, otherwise the expense's
 * `journalEntryId` points at a journal that never gets created.
 */
export function actionableJournalIdMap(outcomes: ImportRowOutcome[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const outcome of outcomes) {
    map.set(outcome.journalId, outcome.actionableJournalId);
  }
  return map;
}

/** Accurate counts for the post-import message. */
export function summarizeImport(outcomes: ImportRowOutcome[]): ImportSummary {
  const summary: ImportSummary = { added: 0, updated: 0, unchanged: 0, skipped: 0, excluded: 0, total: outcomes.length };
  for (const outcome of outcomes) {
    summary[outcome.status]++;
  }
  return summary;
}

export function mergeJournalEntries(
  existing: CsvJournalEntry[],
  incoming: CsvJournalEntry[]
): CsvJournalEntry[] {
  const incomingIds = new Set(incoming.map(j => j.journalId));
  const kept = existing.filter(j => !incomingIds.has(j.journalId));
  return [...kept, ...incoming];
}

/**
 * Merges imported expenses into the stored list by id: an expense whose id is
 * already present is replaced in place, never appended. Content fingerprinting
 * (the previous approach) both dropped legitimately identical rows and left
 * journal links pointing at discarded ids.
 */
export function mergeImportedExpenses(existing: Expense[], incoming: Expense[]): Expense[] {
  if (incoming.length === 0) return existing;
  const incomingById = new Map(incoming.map(e => [e.id, e]));
  const merged = existing.map(e => incomingById.get(e.id) ?? e);
  const existingIds = new Set(existing.map(e => e.id));
  for (const expense of incoming) {
    if (!existingIds.has(expense.id)) merged.push(expense);
  }
  return merged;
}
