import type { Expense, Participant, Currency, Beneficiary, CsvJournalEntry } from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { generateId } from './id';

export interface ImportResult {
  expenses: Expense[];
  journalEntries: CsvJournalEntry[];
  newParticipants: { name: string; id: string }[];
  newCurrencies: { code: string; symbol: string }[];
  skippedRows: { row: number; reason: string }[];
  flaggedRows: { row: number; flag: string; notes: string }[];
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

const IMPORTABLE_ENTRY_TYPES = [
  'expense',
  'expense_personal',
  'expense_group',
  'expense_from_tankhah',
  'expense_treat',
  'expense_alipay',
  'payment_from_tankhah'
];

const SKIP_PAYEE_VALUES = new Set(['هزینه شخصی', 'گروه', 'همه', 'موجودی اولیه سفر', 'هر نفر']);

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  KRW: '₩', INR: '₹', IRR: '﷼', TRY: '₺', RUB: '₽',
  AED: 'د.إ', SAR: '﷼', CAD: 'C$', AUD: 'A$', CHF: 'Fr',
  SEK: 'kr', THB: '฿', MYR: 'RM', BRL: 'R$', MXN: 'Mex$',
  GEL: '₾', AMD: '֏', IQD: 'ع.د', PKR: '₨'
};

export type DateFormat = 'auto' | 'mdy' | 'dmy';

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseFlexibleDate(raw: string, format: DateFormat = 'auto'): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  const withoutTime = cleaned.split(/\s+/)[0];

  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }

  const slashParts = withoutTime.split('/');
  if (slashParts.length === 3) {
    const [a, b, c] = slashParts.map(Number);
    if (c > 100) {
      if (format === 'dmy') return buildDate(c, b, a);
      if (format === 'mdy') return buildDate(c, a, b);
      if (a > 12) return buildDate(c, b, a);
      return buildDate(c, a, b);
    }
    if (a > 100) {
      return buildDate(a, b, c);
    }
  }

  const dashParts = withoutTime.split('-');
  if (dashParts.length === 3) {
    const [a, b, c] = dashParts.map(Number);
    if (a > 100) return buildDate(a, b, c);
    if (c > 100) return buildDate(c, b, a);
  }

  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

function parseNumber(raw: string): number {
  let cleaned = raw.replace(/[^\d.\-,]/g, '');
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

  return parseFloat(cleaned) || 0;
}

function matchesKnownPayer(name: string, payers: Set<string>): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  for (const payer of payers) {
    if (payer.toLowerCase() === lower) return true;
  }
  return false;
}

export function extractUniqueNames(
  rows: CsvRow[],
  mapping: ColumnMapping
): ExtractedNames {
  const payerNames = new Set<string>();

  for (const row of rows) {
    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && !IMPORTABLE_ENTRY_TYPES.includes(entryType)) continue;

    const payer = mapping.payer ? row[mapping.payer].trim() : '';
    if (payer) {
      if (payer.includes('|')) {
        payer.split('|').forEach(n => { if (n.trim()) payerNames.add(n.trim()); });
      } else {
        payerNames.add(payer);
      }
    }
  }

  // Second pass: collect payee names that don't match any payer
  const ambiguousMap = new Map<string, AmbiguousPayee>();

  for (const row of rows) {
    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && !IMPORTABLE_ENTRY_TYPES.includes(entryType)) continue;
    if (entryType === 'expense_personal') continue;

    const payee = mapping.payee ? row[mapping.payee].trim() : '';
    if (!payee || SKIP_PAYEE_VALUES.has(payee)) continue;

    const names = payee.includes('|') ? payee.split('|').map(n => n.trim()).filter(Boolean) : [payee];

    for (const name of names) {
      if (matchesKnownPayer(name, payerNames)) continue;
      if (SKIP_PAYEE_VALUES.has(name)) continue;

      const existing = ambiguousMap.get(name);
      if (existing) {
        existing.occurrences++;
      } else {
        ambiguousMap.set(name, {
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
    confirmed: Array.from(payerNames).sort(),
    ambiguous: Array.from(ambiguousMap.values())
  };
}

export function extractUniqueCurrencies(
  rows: CsvRow[],
  mapping: ColumnMapping
): string[] {
  const codes = new Set<string>();

  for (const row of rows) {
    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && !IMPORTABLE_ENTRY_TYPES.includes(entryType)) continue;

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

export function transformCsvToExpenses(
  rows: CsvRow[],
  mapping: ColumnMapping,
  participantMappings: ParticipantMapping[],
  existingParticipants: Participant[],
  existingCurrencies: Currency[],
  newCurrencies: { code: string; symbol: string }[],
  dateFormat: DateFormat = 'auto',
  tankhahParticipantId?: string
): ImportResult {
  const result: ImportResult = {
    expenses: [],
    journalEntries: [],
    newParticipants: [],
    newCurrencies: [...newCurrencies],
    skippedRows: [],
    flaggedRows: []
  };

  const allParticipants = [...existingParticipants];
  const participantLookup = new Map<string, string>();
  const descriptionNames = new Set<string>();

  for (const existing of existingParticipants) {
    participantLookup.set(existing.name.toLowerCase(), existing.id);
  }

  for (const pm of participantMappings) {
    if (pm.isDescription) {
      descriptionNames.add(pm.csvName.toLowerCase());
      continue;
    }
    if (pm.createNew && !pm.participantId) {
      const id = generateId();
      result.newParticipants.push({ name: pm.csvName, id });
      participantLookup.set(pm.csvName.toLowerCase(), id);
      allParticipants.push({ id, name: pm.csvName });
    } else if (pm.participantId) {
      participantLookup.set(pm.csvName.toLowerCase(), pm.participantId);
    }
  }

  const allCurrencyCodes = new Set([
    ...existingCurrencies.map(c => c.code),
    ...newCurrencies.map(c => c.code)
  ]);

  const seenIds = new Set<string>();

  const sampleRow = rows[0];
  const sampleHeaders = sampleRow ? Object.keys(sampleRow) : [];
  const entryIdCol = sampleHeaders.find(h => h.toLowerCase().includes('entry_id')) ?? null;
  const sourceFileCol = sampleHeaders.find(h => h.toLowerCase().includes('source_file')) ?? null;
  const localNotesCol = sampleHeaders.find(h =>
    h === 'توضیح' || h === 'local_notes' || h.toLowerCase().replace(/[\s_-]+/g, '') === 'localnotes'
  ) ?? null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    const description = mapping.description ? row[mapping.description].trim() : '';
    const payerName = mapping.payer ? row[mapping.payer].trim() : '';
    const payeeName = mapping.payee ? row[mapping.payee].trim() : '';
    const currency = mapping.currency ? row[mapping.currency].trim().toUpperCase() : '';
    const rawAmount = mapping.amount ? row[mapping.amount] : '0';
    const amount = Math.round(Math.abs(parseNumber(rawAmount)) * 100) / 100;
    const rawDate = mapping.date ? row[mapping.date] : '';
    const date = parseFlexibleDate(rawDate, dateFormat);
    const notes = mapping.notes ? row[mapping.notes].trim() : '';
    const flag = mapping.flag ? row[mapping.flag].trim() : '';
    const journalId = mapping.id ? row[mapping.id].trim() : `row-${rowNum}`;

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

    // --- Validation for expense conversion ---

    if (mapping.entryType && !IMPORTABLE_ENTRY_TYPES.includes(entryType)) {
      const reason = `Non-expense entry type: ${entryType}`;
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
      continue;
    }

    if (mapping.id) {
      const rowId = row[mapping.id].trim();
      if (rowId && seenIds.has(rowId)) {
        const reason = `Duplicate ID: ${rowId}`;
        result.skippedRows.push({ row: rowNum, reason });
        journalEntry.skipReason = reason;
        result.journalEntries.push(journalEntry);
        continue;
      }
      if (rowId) seenIds.add(rowId);
    }

    if (description.includes('تکرار ثبت')) {
      const reason = 'Duplicate entry (تکرار ثبت)';
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
      continue;
    }

    if (currency === 'UNKNOWN' || !currency) {
      const reason = 'Unknown or missing currency';
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
      continue;
    }
    if (!allCurrencyCodes.has(currency)) {
      const reason = `Currency ${currency} not configured`;
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
      continue;
    }

    if (!date) {
      const reason = 'Invalid date';
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
      continue;
    }

    if (amount <= 0) {
      const reason = 'Invalid amount';
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
      continue;
    }

    const payerId = resolveParticipantId(payerName, participantLookup);
    if (!payerId) {
      const reason = payerName
        ? `Unknown payer: ${payerName}`
        : 'No payer column mapped or payer is empty';
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
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
      beneficiaries = resolveBeneficiaries(
        payeeName, entryType, payerId, allParticipants, participantLookup, tankhahParticipantId
      );
    }

    if (beneficiaries.length === 0) {
      const reason = 'Could not determine beneficiaries';
      result.skippedRows.push({ row: rowNum, reason });
      journalEntry.skipReason = reason;
      result.journalEntries.push(journalEntry);
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

    const expenseId = generateId();
    const isTreatEntry = entryType === 'expense_treat';
    result.expenses.push({
      id: expenseId,
      date,
      description: enrichedDescription || `Row ${rowNum}`,
      currencyCode: currency,
      amount,
      paidBy: payerId,
      splitType: 'equal',
      beneficiaries,
      ...(isTreatEntry ? { isTreat: true } : {})
    });

    journalEntry.linkedExpenseId = expenseId;
    journalEntry.status = flag ? 'flagged' : 'imported';
    result.journalEntries.push(journalEntry);
  }

  return result;
}

export function mergeJournalEntries(
  existing: CsvJournalEntry[],
  incoming: CsvJournalEntry[]
): CsvJournalEntry[] {
  const incomingIds = new Set(incoming.map(j => j.journalId));
  const kept = existing.filter(j => !incomingIds.has(j.journalId));
  return [...kept, ...incoming];
}

function makeBeneficiary(pid: string): Beneficiary {
  return { participantId: pid, customAmount: null, customPercentage: null };
}

function resolveParticipantId(
  name: string,
  lookup: Map<string, string>
): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return lookup.get(lower) ?? null;
}

function resolveBeneficiaries(
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

  if (payeeName === 'گروه' || payeeName === 'همه' || entryType === 'expense_group' || entryType === 'expense_from_tankhah' || entryType === 'expense_treat') {
    return groupParticipants.map(p => makeBeneficiary(p.id));
  }

  if (payeeName === 'هزینه شخصی') {
    return [makeBeneficiary(payerId)];
  }

  if (entryType === 'expense_personal' && !payeeName) {
    return [makeBeneficiary(payerId)];
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
