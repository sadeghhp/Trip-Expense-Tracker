import type { Expense, Participant, Currency, JournalEntry, PendingImportItem } from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { generateId } from './id';
import {
  buildJournalEntryFromCsvRow,
  applyJournalEntryLogic,
  buildTransformContext,
  SKIP_ENTRY_TYPES,
  parseFlexibleDate
} from './journal-apply';

export interface ImportResult {
  expenses: Expense[];
  journals: JournalEntry[];
  newParticipants: { name: string; id: string }[];
  newCurrencies: { code: string; symbol: string }[];
  skippedRows: { row: number; reason: string }[];
  flaggedRows: { row: number; flag: string; notes: string }[];
  pendingItems: PendingImportItem[];
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

const SKIP_PAYEE_VALUES = new Set(['هزینه شخصی', 'گروه', 'همه', 'all', 'موجودی اولیه سفر', 'هر نفر']);

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  KRW: '₩', INR: '₹', IRR: '﷼', TRY: '₺', RUB: '₽',
  AED: 'د.إ', SAR: '﷼', CAD: 'C$', AUD: 'A$', CHF: 'Fr',
  SEK: 'kr', THB: '฿', MYR: 'RM', BRL: 'R$', MXN: 'Mex$',
  GEL: '₾', AMD: '֏', IQD: 'ع.د', PKR: '₨'
};

export { parseFlexibleDate };
export { SKIP_ENTRY_TYPES, SWAPPED_ENTRY_TYPES, resolveBeneficiaries, resolveParticipantId } from './journal-apply';

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
    const payer = mapping.payer ? row[mapping.payer].trim() : '';
    if (payer) {
      if (payer.includes('|')) {
        payer.split('|').forEach(n => { if (n.trim()) payerNames.add(n.trim()); });
      } else {
        payerNames.add(payer);
      }
    }
  }

  const ambiguousMap = new Map<string, AmbiguousPayee>();

  for (const row of rows) {
    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && SKIP_ENTRY_TYPES.has(entryType)) continue;
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
    const entryType = mapping.entryType ? row[mapping.entryType] : '';
    if (mapping.entryType && SKIP_ENTRY_TYPES.has(entryType)) continue;

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
  newCurrencies: { code: string; symbol: string }[]
): ImportResult {
  const result: ImportResult = {
    expenses: [],
    journals: [],
    newParticipants: [],
    newCurrencies: [...newCurrencies],
    skippedRows: [],
    flaggedRows: [],
    pendingItems: []
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

  const importBatchId = generateId();
  const now = new Date().toISOString();

  const appDataForApply = {
    participants: allParticipants,
    currencies: [...existingCurrencies, ...newCurrencies.map(c => ({ code: c.code, symbol: c.symbol }))],
    expenses: [] as Expense[],
    journals: [] as JournalEntry[],
    pendingImports: [],
    exchangeRates: {},
    settlementCurrency: ''
  };

  function skipJournal(journal: JournalEntry, rowNum: number, reason: string) {
    const failed: JournalEntry = {
      ...journal,
      status: 'error',
      skipReason: reason,
      updatedAt: now
    };
    result.journals.push(failed);
    result.skippedRows.push({ row: rowNum, reason });
    result.pendingItems.push({
      id: journal.id,
      rawData: journal.rawData,
      reason,
      createdAt: now,
      date: journal.date || undefined,
      description: journal.description || undefined,
      amount: journal.amount || undefined,
      currencyCode: journal.currencyCode || undefined,
      payerName: journal.payerName || undefined,
      payeeName: journal.payeeName || undefined,
      entryType: journal.entryType || undefined
    });
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const journal = buildJournalEntryFromCsvRow(row, mapping, rowNum, importBatchId);

    if (journal.flag) {
      result.flaggedRows.push({ row: rowNum, flag: journal.flag, notes: journal.notes ?? '' });
    }

    const context = buildTransformContext(
      appDataForApply,
      participantLookup,
      descriptionNames,
      journal.id,
      undefined,
      rowNum
    );

    const applyResult = applyJournalEntryLogic(journal, appDataForApply, context);

    if (!applyResult.success || !applyResult.expense) {
      skipJournal(
        { ...journal, ...applyResult.journalPatch },
        rowNum,
        applyResult.error ?? 'Transform failed'
      );
      continue;
    }

    const appliedJournal: JournalEntry = {
      ...journal,
      ...applyResult.journalPatch,
      status: 'applied',
      expenseId: applyResult.expense.id,
      updatedAt: now
    };

    result.journals.push(appliedJournal);
    result.expenses.push(applyResult.expense);
    appDataForApply.expenses.push(applyResult.expense);
  }

  return result;
}
