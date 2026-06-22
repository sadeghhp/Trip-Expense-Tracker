import type { Expense, Participant, Currency, Beneficiary } from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { generateId } from './id';

export interface ImportResult {
  expenses: Expense[];
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
  'expense_alipay',
  'payment_from_tankhah'
];

const SKIP_PAYEE_VALUES = new Set(['هزینه شخصی', 'گروه', 'موجودی اولیه سفر', 'هر نفر']);

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  KRW: '₩', INR: '₹', IRR: '﷼', TRY: '₺', RUB: '₽',
  AED: 'د.إ', SAR: '﷼', CAD: 'C$', AUD: 'A$', CHF: 'Fr',
  SEK: 'kr', THB: '฿', MYR: 'RM', BRL: 'R$', MXN: 'Mex$',
  GEL: '₾', AMD: '֏', IQD: 'ع.د', PKR: '₨'
};

export function parseFlexibleDate(raw: string): string | null {
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
      if (a > 12) {
        return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
      }
      return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
    if (a > 100) {
      return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
    }
  }

  const dashParts = withoutTime.split('-');
  if (dashParts.length === 3) {
    const [a, b, c] = dashParts.map(Number);
    if (a > 100) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
    if (c > 100) return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }

  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.\-,]/g, '').replace(/,(?=\d{3})/g, '');
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

  // First pass: payers are always real people/entities
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
    const entryType = mapping.entryType ? row[mapping.entryType] : '';
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
  newCurrencies: { code: string; symbol: string }[]
): ImportResult {
  const result: ImportResult = {
    expenses: [],
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && !IMPORTABLE_ENTRY_TYPES.includes(entryType)) {
      result.skippedRows.push({ row: rowNum, reason: `Non-expense entry type: ${entryType}` });
      continue;
    }

    const description = mapping.description ? row[mapping.description].trim() : '';
    if (description.includes('تکرار ثبت')) {
      result.skippedRows.push({ row: rowNum, reason: 'Duplicate entry (تکرار ثبت)' });
      continue;
    }

    const currency = mapping.currency ? row[mapping.currency].trim().toUpperCase() : '';
    if (currency === 'UNKNOWN' || !currency) {
      result.skippedRows.push({ row: rowNum, reason: `Unknown or missing currency` });
      continue;
    }
    if (!allCurrencyCodes.has(currency)) {
      result.skippedRows.push({ row: rowNum, reason: `Currency ${currency} not configured` });
      continue;
    }

    const rawDate = mapping.date ? row[mapping.date] : '';
    const date = parseFlexibleDate(rawDate);
    if (!date) {
      result.skippedRows.push({ row: rowNum, reason: 'Invalid date' });
      continue;
    }

    const rawAmount = mapping.amount ? row[mapping.amount] : '0';
    const amount = Math.round(Math.abs(parseNumber(rawAmount)) * 100) / 100;
    if (amount <= 0) {
      result.skippedRows.push({ row: rowNum, reason: 'Invalid amount' });
      continue;
    }

    const payerName = mapping.payer ? row[mapping.payer].trim() : '';
    const payerId = resolveParticipantId(payerName, participantLookup);
    if (!payerId) {
      const reason = payerName
        ? `Unknown payer: ${payerName}`
        : 'No payer column mapped or payer is empty';
      result.skippedRows.push({ row: rowNum, reason });
      continue;
    }

    const payeeName = mapping.payee ? row[mapping.payee].trim() : '';

    // Check if payee was marked as a description
    const payeeIsDescription = payeeName
      ? descriptionNames.has(payeeName.toLowerCase())
      : false;

    let beneficiaries: Beneficiary[];
    let enrichedDescription = description;

    if (payeeIsDescription) {
      beneficiaries = allParticipants.map(p => makeBeneficiary(p.id));
      if (payeeName && !description.includes(payeeName)) {
        enrichedDescription = description ? `${description} - ${payeeName}` : payeeName;
      }
    } else {
      beneficiaries = resolveBeneficiaries(
        payeeName, entryType, payerId, allParticipants, participantLookup
      );
    }

    if (beneficiaries.length === 0) {
      result.skippedRows.push({ row: rowNum, reason: 'Could not determine beneficiaries' });
      continue;
    }

    const notes = mapping.notes ? row[mapping.notes].trim() : '';
    const flag = mapping.flag ? row[mapping.flag].trim() : '';

    if (flag) {
      result.flaggedRows.push({ row: rowNum, flag, notes });
    }

    result.expenses.push({
      id: generateId(),
      date,
      description: enrichedDescription || `Row ${rowNum}`,
      currencyCode: currency,
      amount,
      paidBy: payerId,
      splitType: 'equal',
      beneficiaries
    });
  }

  return result;
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
  lookup: Map<string, string>
): Beneficiary[] {
  if (payeeName === 'گروه' || entryType === 'expense_group' || entryType === 'expense_from_tankhah') {
    return allParticipants.map(p => makeBeneficiary(p.id));
  }

  if (payeeName === 'هزینه شخصی' || entryType === 'expense_personal') {
    return [makeBeneficiary(payerId)];
  }

  if (!payeeName) {
    return allParticipants.map(p => makeBeneficiary(p.id));
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
