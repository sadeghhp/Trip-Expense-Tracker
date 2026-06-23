import type { Expense, Participant, Currency, Beneficiary, PendingImportItem } from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { generateId } from './id';

export interface ImportResult {
  expenses: Expense[];
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

const SWAPPED_ENTRY_TYPES = new Set(['debt_statement']);

const SKIP_ENTRY_TYPES = new Set(['currency_exchange', 'fund_opening']);

const SKIP_PAYEE_VALUES = new Set(['هزینه شخصی', 'گروه', 'همه', 'all', 'موجودی اولیه سفر', 'هر نفر']);

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

  const allCurrencyCodes = new Set([
    ...existingCurrencies.map(c => c.code),
    ...newCurrencies.map(c => c.code)
  ]);

  const INTERNAL_SKIP_TYPES = new Set([
    'cash_transfer', 'withdrawal', 'advance_received',
    'loan_disbursement', 'allowance_grant', 'debt_statement'
  ]);

  function skipRow(row: CsvRow, rowNum: number, reason: string, partial: Partial<PendingImportItem> = {}) {
    result.skippedRows.push({ row: rowNum, reason });
    result.pendingItems.push({
      id: generateId(),
      rawData: { ...row },
      reason,
      createdAt: new Date().toISOString(),
      ...partial
    });
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const entryType = mapping.entryType ? row[mapping.entryType].trim() : '';
    if (mapping.entryType && SKIP_ENTRY_TYPES.has(entryType)) {
      skipRow(row, rowNum, `Non-importable entry type: ${entryType}`, {
        entryType,
        description: mapping.description ? row[mapping.description].trim() : undefined,
        payerName: mapping.payer ? row[mapping.payer].trim() : undefined,
        payeeName: mapping.payee ? row[mapping.payee].trim() : undefined
      });
      continue;
    }
    const isSwapped = mapping.entryType ? SWAPPED_ENTRY_TYPES.has(entryType) : false;

    const description = mapping.description ? row[mapping.description].trim() : '';
    if (description.includes('تکرار ثبت')) {
      skipRow(row, rowNum, 'Duplicate entry (تکرار ثبت)', { description, entryType: entryType || undefined });
      continue;
    }

    const currency = mapping.currency ? row[mapping.currency].trim().toUpperCase() : '';
    if (currency === 'UNKNOWN' || !currency) {
      skipRow(row, rowNum, 'Unknown or missing currency', { description, entryType: entryType || undefined });
      continue;
    }
    if (!allCurrencyCodes.has(currency)) {
      skipRow(row, rowNum, `Currency ${currency} not configured`, {
        description, currencyCode: currency, entryType: entryType || undefined
      });
      continue;
    }

    const rawDate = mapping.date ? row[mapping.date] : '';
    const date = parseFlexibleDate(rawDate);
    if (!date) {
      skipRow(row, rowNum, 'Invalid date', {
        description, currencyCode: currency, entryType: entryType || undefined
      });
      continue;
    }

    const rawAmount = mapping.amount ? row[mapping.amount] : '0';
    const amount = Math.round(Math.abs(parseNumber(rawAmount)) * 100) / 100;
    if (amount <= 0) {
      skipRow(row, rowNum, 'Invalid amount', {
        description, currencyCode: currency, date, entryType: entryType || undefined
      });
      continue;
    }

    let payerName = mapping.payer ? row[mapping.payer].trim() : '';
    let payeeName = mapping.payee ? row[mapping.payee].trim() : '';

    if (isSwapped) {
      [payerName, payeeName] = [payeeName, payerName];
    }

    if (payerName && payeeName && payerName.toLowerCase() === payeeName.toLowerCase()
        && INTERNAL_SKIP_TYPES.has(entryType)) {
      skipRow(row, rowNum, 'Internal transfer (same payer and payee)', {
        description, currencyCode: currency, date, amount, payerName, payeeName, entryType
      });
      continue;
    }

    const payerId = resolveParticipantId(payerName, participantLookup);
    if (!payerId) {
      const reason = payerName
        ? `Unknown payer: ${payerName}`
        : 'No payer column mapped or payer is empty';
      skipRow(row, rowNum, reason, {
        description, currencyCode: currency, date, amount, payerName, payeeName, entryType: entryType || undefined
      });
      continue;
    }

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
      skipRow(row, rowNum, 'Could not determine beneficiaries', {
        description, currencyCode: currency, date, amount, payerName, payeeName, entryType: entryType || undefined
      });
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
  const payeeLower = payeeName.toLowerCase();
  if (payeeLower === 'گروه' || payeeLower === 'همه' || payeeLower === 'all' || entryType === 'expense_group' || entryType === 'expense_from_tankhah') {
    return allParticipants.map(p => makeBeneficiary(p.id));
  }

  if (payeeName === 'هزینه شخصی' || entryType === 'expense_personal') {
    return [makeBeneficiary(payerId)];
  }

  const TRANSFER_TYPES = ['withdrawal', 'cash_transfer', 'advance_received', 'loan_disbursement', 'allowance_grant'];
  if (TRANSFER_TYPES.includes(entryType)) {
    if (payeeName === 'all' || payeeName === 'همه') {
      return allParticipants.map(p => makeBeneficiary(p.id));
    }
    const payeeId = resolveParticipantId(payeeName, lookup);
    if (payeeId) return [makeBeneficiary(payeeId)];
    return [];
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
