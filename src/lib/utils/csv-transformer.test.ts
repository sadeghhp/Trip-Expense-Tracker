import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseFlexibleDate,
  extractUniqueNames,
  extractUniqueCurrencies,
  getSymbolForCurrency,
  transformCsvToExpenses,
  mergeJournalEntries
} from './csv-transformer';
import type { ColumnMapping } from './csv-mapper';
import type { CsvRow } from './csv-parser';
import { makeParticipant, makeCurrency } from '../../test/factories';

vi.mock('./id', () => ({
  generateId: vi.fn(() => 'generated-id')
}));

const baseMapping: ColumnMapping = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  currency: 'Currency',
  payer: 'Payer',
  payee: 'Payee',
  entryType: 'Type',
  id: null,
  flag: null,
  notes: null
};

describe('parseFlexibleDate', () => {
  it('returns ISO format as-is', () => {
    expect(parseFlexibleDate('2024-06-15')).toBe('2024-06-15');
  });

  it('strips time from ISO datetime', () => {
    expect(parseFlexibleDate('2024-06-15 14:30:00')).toBe('2024-06-15');
  });

  it('parses US slash format', () => {
    expect(parseFlexibleDate('06/15/2024')).toBe('2024-06-15');
  });

  it('parses European slash format when day > 12', () => {
    expect(parseFlexibleDate('15/06/2024')).toBe('2024-06-15');
  });

  it('parses year-first dash format', () => {
    expect(parseFlexibleDate('2024-06-15')).toBe('2024-06-15');
  });

  it('parses day-first dash when year at end', () => {
    expect(parseFlexibleDate('15-06-2024')).toBe('2024-06-15');
  });

  it('returns null for empty string', () => {
    expect(parseFlexibleDate('')).toBeNull();
  });

  it('returns null for invalid string', () => {
    expect(parseFlexibleDate('not a date')).toBeNull();
  });

  it('passes through Jalali-looking dates', () => {
    expect(parseFlexibleDate('1403-01-01')).toBe('1403-01-01');
  });

  it('uses US interpretation for ambiguous 01/02/2024', () => {
    expect(parseFlexibleDate('01/02/2024')).toBe('2024-01-02');
  });

  it('forces DMY format when specified', () => {
    expect(parseFlexibleDate('01/02/2024', 'dmy')).toBe('2024-02-01');
  });

  it('forces MDY format when specified', () => {
    expect(parseFlexibleDate('01/02/2024', 'mdy')).toBe('2024-01-02');
  });

  it('parses datetime with time component in MDY', () => {
    expect(parseFlexibleDate('6/13/2026 9:06', 'mdy')).toBe('2026-06-13');
  });

  it('returns null for invalid date when DMY produces month > 12', () => {
    expect(parseFlexibleDate('6/13/2026 9:06', 'dmy')).toBeNull();
  });

  it('returns null for invalid date when day > 31', () => {
    expect(parseFlexibleDate('32/01/2024', 'dmy')).toBeNull();
  });

  it('parses valid DMY datetime', () => {
    expect(parseFlexibleDate('13/6/2026 9:06', 'dmy')).toBe('2026-06-13');
  });
});

describe('extractUniqueNames', () => {
  it('confirms payer names', () => {
    const rows = [{ Payer: 'Alice', Payee: 'Bob', Type: 'expense', Amount: '100', Currency: 'USD' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.confirmed).toContain('Alice');
  });

  it('splits pipe-separated payer names', () => {
    const rows = [{ Payer: 'Alice|Bob', Payee: 'Group', Type: 'expense', Amount: '100', Currency: 'USD' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.confirmed).toContain('Alice');
    expect(result.confirmed).toContain('Bob');
  });

  it('marks unmatched payees as ambiguous', () => {
    const rows = [{ Payer: 'Alice', Payee: 'Unknown Shop', Type: 'expense', Amount: '100', Currency: 'USD' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous.some(a => a.name === 'Unknown Shop')).toBe(true);
  });

  it('does not mark payee matching payer as ambiguous', () => {
    const rows = [{ Payer: 'Alice', Payee: 'alice', Type: 'expense' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous).toHaveLength(0);
  });

  it('skips personal expense payees', () => {
    const rows = [{ Payer: 'Alice', Payee: 'هزینه شخصی', Type: 'expense_personal' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous).toHaveLength(0);
  });

  it('skips non-importable entry types for payees', () => {
    const rows = [{ Payer: 'Alice', Payee: 'Shop', Type: 'transfer' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous).toHaveLength(0);
  });

  it('skips non-importable entry types for payers', () => {
    const rows: CsvRow[] = [
      { Payer: 'Fund', Payee: 'Alice', Type: 'advance_received' },
      { Payer: 'Alice', Payee: 'Bob', Type: 'expense', Amount: '100', Currency: 'USD' }
    ];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.confirmed).toContain('Alice');
    expect(result.confirmed).not.toContain('Fund');
  });

  it('counts ambiguous payee occurrences', () => {
    const rows = [
      { Payer: 'Alice', Payee: 'Shop', Type: 'expense', Amount: '10', Currency: 'USD' },
      { Payer: 'Alice', Payee: 'Shop', Type: 'expense', Amount: '20', Currency: 'USD' }
    ];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous.find(a => a.name === 'Shop')?.occurrences).toBe(2);
  });

  it('does not substring-match payer names against payees', () => {
    const rows = [{ Payer: 'Ali', Payee: 'Alice', Type: 'expense', Amount: '100', Currency: 'USD' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous.some(a => a.name === 'Alice')).toBe(true);
  });
});

describe('extractUniqueCurrencies', () => {
  it('collects unique currency codes', () => {
    const rows = [
      { Currency: 'usd', Type: 'expense' },
      { Currency: 'EUR', Type: 'expense' },
      { Currency: 'USD', Type: 'expense' }
    ];
    expect(extractUniqueCurrencies(rows, baseMapping)).toEqual(['EUR', 'USD']);
  });

  it('filters UNKNOWN and empty', () => {
    const rows = [
      { Currency: 'UNKNOWN', Type: 'expense' },
      { Currency: '', Type: 'expense' },
      { Currency: 'USD', Type: 'expense' }
    ];
    expect(extractUniqueCurrencies(rows, baseMapping)).toEqual(['USD']);
  });

  it('skips non-importable entry types', () => {
    const rows = [{ Currency: 'USD', Type: 'transfer' }];
    expect(extractUniqueCurrencies(rows, baseMapping)).toEqual([]);
  });
});

describe('getSymbolForCurrency', () => {
  it('returns symbol for known currency', () => {
    expect(getSymbolForCurrency('USD')).toBe('$');
  });

  it('returns code for unknown currency', () => {
    expect(getSymbolForCurrency('XYZ')).toBe('XYZ');
  });
});

describe('transformCsvToExpenses', () => {
  const participants = [
    makeParticipant({ id: 'p-1', name: 'Alice' }),
    makeParticipant({ id: 'p-2', name: 'Bob' })
  ];
  const currencies = [makeCurrency({ code: 'USD', symbol: '$' })];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transforms valid row into expense', () => {
    const rows = [{
      Date: '2024-06-15',
      Description: 'Lunch',
      Amount: '50',
      Currency: 'USD',
      Payer: 'Alice',
      Payee: 'Bob',
      Type: 'expense'
    }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]).toMatchObject({
      date: '2024-06-15',
      description: 'Lunch',
      amount: 50,
      currencyCode: 'USD',
      paidBy: 'p-1'
    });
  });

  it('skips non-importable entry type', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'transfer' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(0);
    expect(result.skippedRows[0].reason).toContain('Non-expense');
  });

  it('skips duplicate entries', () => {
    const rows = [{ Date: '2024-06-15', Description: 'تکرار ثبت', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.skippedRows[0].reason).toContain('Duplicate');
  });

  it('skips unknown currency', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'UNKNOWN', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.skippedRows[0].reason).toContain('currency');
  });

  it('skips invalid date', () => {
    const rows = [{ Date: 'bad', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.skippedRows[0].reason).toBe('Invalid date');
  });

  it('skips zero or negative amount', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '0', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.skippedRows[0].reason).toBe('Invalid amount');
  });

  it('skips unknown payer', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Charlie', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.skippedRows[0].reason).toContain('Unknown payer');
  });

  it('creates new participant when mapping says createNew', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Charlie', Payee: 'گروه', Type: 'expense_group' }];
    const mappings = [{ csvName: 'Charlie', participantId: null, createNew: true, isDescription: false }];
    const result = transformCsvToExpenses(rows, baseMapping, mappings, participants, currencies, []);
    expect(result.newParticipants).toHaveLength(1);
    expect(result.expenses).toHaveLength(1);
  });

  it('treats payee as description when isDescription', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Dinner', Amount: '30', Currency: 'USD', Payer: 'Alice', Payee: 'Restaurant', Type: 'expense' }];
    const mappings = [{ csvName: 'Restaurant', participantId: null, createNew: false, isDescription: true }];
    const result = transformCsvToExpenses(rows, baseMapping, mappings, participants, currencies, []);
    expect(result.expenses[0].description).toContain('Restaurant');
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
  });

  it('group expense includes all participants', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Trip', Amount: '100', Currency: 'USD', Payer: 'Alice', Payee: 'گروه', Type: 'expense_group' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
  });

  it('personal expense with هزینه شخصی payee benefits only payer', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Solo', Amount: '20', Currency: 'USD', Payer: 'Alice', Payee: 'هزینه شخصی', Type: 'expense_personal' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toEqual([
      { participantId: 'p-1', customAmount: null, customPercentage: null }
    ]);
  });

  it('personal expense with empty payee benefits only payer', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Solo', Amount: '20', Currency: 'USD', Payer: 'Alice', Payee: '', Type: 'expense_personal' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toEqual([
      { participantId: 'p-1', customAmount: null, customPercentage: null }
    ]);
  });

  it('personal expense with named payee benefits the payee not the payer', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Gift for Bob', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense_personal' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toEqual([
      { participantId: 'p-2', customAmount: null, customPercentage: null }
    ]);
  });

  it('personal expense with گروه payee benefits all participants', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Lunch', Amount: '100', Currency: 'USD', Payer: 'Alice', Payee: 'گروه', Type: 'expense_personal' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
  });

  it('resolves pipe-separated payees', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Split', Amount: '60', Currency: 'USD', Payer: 'Alice', Payee: 'Alice|Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
  });

  it('skips row when payee is unresolvable', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Unknown', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(0);
    expect(result.skippedRows[0].reason).toBe('Could not determine beneficiaries');
  });

  it('tracks flagged rows', () => {
    const mapping = { ...baseMapping, flag: 'Flag', notes: 'Notes' };
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense', Flag: 'review', Notes: 'check' }];
    const result = transformCsvToExpenses(rows, mapping, [], participants, currencies, []);
    expect(result.flaggedRows).toHaveLength(1);
    expect(result.flaggedRows[0]).toMatchObject({ flag: 'review', notes: 'check' });
  });

  it('strips commas and currency symbols from amount', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '$1,234.56', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].amount).toBe(1234.56);
  });

  it('converts negative amounts to absolute values', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '-25', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].amount).toBe(25);
  });

  it('does not fuzzy-match participant names', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Ali', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(0);
    expect(result.skippedRows[0].reason).toContain('Unknown payer: Ali');
  });

  it('shows descriptive message when payer column is not mapped', () => {
    const noPayerMapping = { ...baseMapping, payer: null };
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, noPayerMapping, [], participants, currencies, []);
    expect(result.skippedRows[0].reason).toBe('No payer column mapped or payer is empty');
  });

  it('skips row when pipe-separated payees are all unresolvable', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'X|Y|Z', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(0);
    expect(result.skippedRows[0].reason).toBe('Could not determine beneficiaries');
  });

  it('skips duplicate rows by ID', () => {
    const mappingWithId = { ...baseMapping, id: 'ID' };
    const rows = [
      { ID: 'J001', Date: '2024-06-15', Description: 'First', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' },
      { ID: 'J001', Date: '2024-06-15', Description: 'Dupe', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }
    ];
    const result = transformCsvToExpenses(rows, mappingWithId, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].description).toBe('First');
    expect(result.skippedRows.some(s => s.reason.includes('Duplicate ID'))).toBe(true);
  });

  it('appends notes to description', () => {
    const mappingWithNotes = { ...baseMapping, notes: 'Notes' };
    const rows = [{ Date: '2024-06-15', Description: 'Food', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense', Notes: 'Chinese restaurant' }];
    const result = transformCsvToExpenses(rows, mappingWithNotes, [], participants, currencies, []);
    expect(result.expenses[0].description).toBe('Food - Chinese restaurant');
  });

  it('does not duplicate notes already in description', () => {
    const mappingWithNotes = { ...baseMapping, notes: 'Notes' };
    const rows = [{ Date: '2024-06-15', Description: 'Chinese restaurant', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense', Notes: 'Chinese restaurant' }];
    const result = transformCsvToExpenses(rows, mappingWithNotes, [], participants, currencies, []);
    expect(result.expenses[0].description).toBe('Chinese restaurant');
  });

  it('appends notes even when description is a substring of notes', () => {
    const mappingWithNotes = { ...baseMapping, notes: 'Notes' };
    const rows = [{ Date: '2024-06-15', Description: 'Fast Food', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense', Notes: 'Food' }];
    const result = transformCsvToExpenses(rows, mappingWithNotes, [], participants, currencies, []);
    expect(result.expenses[0].description).toBe('Fast Food - Food');
  });

  it('does not let non-importable rows consume IDs for dedup', () => {
    const mappingWithId = { ...baseMapping, id: 'ID' };
    const rows = [
      { ID: 'J001', Date: '2024-06-15', Description: 'Transfer', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'transfer' },
      { ID: 'J001', Date: '2024-06-15', Description: 'Expense', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }
    ];
    const result = transformCsvToExpenses(rows, mappingWithId, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].description).toBe('Expense');
  });

  it('parses European decimal format (comma as decimal separator)', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '1.234,56', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].amount).toBe(1234.56);
  });

  it('parses thousand-separated amount without decimal (1,234 = 1234)', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '1,234', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].amount).toBe(1234);
  });

  it('parses European decimal without thousands (1,56 = 1.56)', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '1,56', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].amount).toBe(1.56);
  });

  it('imports payment_from_tankhah as expense', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Hotel', Amount: '1400', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'payment_from_tankhah' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].description).toBe('Hotel');
  });

  it('excludes tankhah participant from group expense beneficiaries', () => {
    const threeParticipants = [
      makeParticipant({ id: 'p-1', name: 'Alice' }),
      makeParticipant({ id: 'p-2', name: 'Bob' }),
      makeParticipant({ id: 'p-3', name: 'Charlie' })
    ];
    const rows = [{ Date: '2024-06-15', Description: 'Dinner', Amount: '300', Currency: 'USD', Payer: 'Charlie', Payee: 'گروه', Type: 'expense_group' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], threeParticipants, currencies, [], 'auto', 'p-3');
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
    expect(result.expenses[0].beneficiaries.map(b => b.participantId)).not.toContain('p-3');
  });

  it('excludes tankhah from expense_from_tankhah beneficiaries', () => {
    const threeParticipants = [
      makeParticipant({ id: 'p-1', name: 'Alice' }),
      makeParticipant({ id: 'p-2', name: 'Bob' }),
      makeParticipant({ id: 'p-3', name: 'Charlie' })
    ];
    const rows = [{ Date: '2024-06-15', Description: 'Food', Amount: '150', Currency: 'USD', Payer: 'Charlie', Payee: 'همه', Type: 'expense_from_tankhah' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], threeParticipants, currencies, [], 'auto', 'p-3');
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
    expect(result.expenses[0].beneficiaries.map(b => b.participantId).sort()).toEqual(['p-1', 'p-2']);
  });

  it('excludes tankhah from description-payee group beneficiaries', () => {
    const threeParticipants = [
      makeParticipant({ id: 'p-1', name: 'Alice' }),
      makeParticipant({ id: 'p-2', name: 'Bob' }),
      makeParticipant({ id: 'p-3', name: 'Charlie' })
    ];
    const rows = [{ Date: '2024-06-15', Description: 'Dinner', Amount: '200', Currency: 'USD', Payer: 'Alice', Payee: 'Restaurant', Type: 'expense' }];
    const mappings = [{ csvName: 'Restaurant', participantId: null, createNew: false, isDescription: true }];
    const result = transformCsvToExpenses(rows, baseMapping, mappings, threeParticipants, currencies, [], 'auto', 'p-3');
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
    expect(result.expenses[0].beneficiaries.map(b => b.participantId)).not.toContain('p-3');
  });

  it('includes all participants when no tankhah is set', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Trip', Amount: '100', Currency: 'USD', Payer: 'Alice', Payee: 'گروه', Type: 'expense_group' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, [], 'auto', undefined);
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
  });

  it('uses date format parameter', () => {
    const rows = [{ Date: '01/02/2024', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
    const resultMdy = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, [], 'mdy');
    expect(resultMdy.expenses[0].date).toBe('2024-01-02');
    const resultDmy = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, [], 'dmy');
    expect(resultDmy.expenses[0].date).toBe('2024-02-01');
  });

  describe('journal entries', () => {
    it('creates a journal entry for every row', () => {
      const rows = [
        { Date: '2024-06-15', Description: 'Lunch', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' },
        { Date: '2024-06-15', Description: 'Transfer', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'transfer' },
        { Date: 'bad', Description: 'Bad', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }
      ];
      const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
      expect(result.journalEntries).toHaveLength(3);
    });

    it('links imported journal entry to its expense', () => {
      const rows = [{ Date: '2024-06-15', Description: 'Lunch', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
      const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
      expect(result.journalEntries[0].status).toBe('imported');
      expect(result.journalEntries[0].linkedExpenseId).toBe(result.expenses[0].id);
    });

    it('marks skipped rows with status and reason', () => {
      const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'transfer' }];
      const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
      expect(result.journalEntries[0].status).toBe('skipped');
      expect(result.journalEntries[0].skipReason).toContain('Non-expense');
      expect(result.journalEntries[0].linkedExpenseId).toBeNull();
    });

    it('preserves raw data fields in journal entry', () => {
      const rows = [{ Date: '2024-06-15', Description: 'Lunch', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' }];
      const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
      const entry = result.journalEntries[0];
      expect(entry.entryType).toBe('expense');
      expect(entry.payer).toBe('Alice');
      expect(entry.payee).toBe('Bob');
      expect(entry.currency).toBe('USD');
      expect(entry.amount).toBe(50);
      expect(entry.description).toBe('Lunch');
    });

    it('marks flagged entries with flagged status', () => {
      const mapping = { ...baseMapping, flag: 'Flag', notes: 'Notes' };
      const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense', Flag: 'review', Notes: 'check' }];
      const result = transformCsvToExpenses(rows, mapping, [], participants, currencies, []);
      expect(result.journalEntries[0].status).toBe('flagged');
      expect(result.journalEntries[0].flag).toBe('review');
    });

    it('total journal entries equals total input rows', () => {
      const rows = [
        { Date: '2024-06-15', Description: 'A', Amount: '50', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' },
        { Date: '2024-06-15', Description: 'B', Amount: '0', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' },
        { Date: '2024-06-15', Description: 'C', Amount: '30', Currency: 'UNKNOWN', Payer: 'Alice', Payee: 'Bob', Type: 'expense' },
        { Date: 'bad', Description: 'D', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'expense' },
        { Date: '2024-06-15', Description: 'E', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Bob', Type: 'transfer' }
      ];
      const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
      expect(result.journalEntries).toHaveLength(5);
      expect(result.journalEntries.filter(j => j.status === 'imported')).toHaveLength(1);
      expect(result.journalEntries.filter(j => j.status === 'skipped')).toHaveLength(4);
    });

    it('captures توضیح column as localNotes', () => {
      const mapping = { ...baseMapping, notes: null };
      const rows = [{
        Date: '2024-06-15',
        Description: 'Food',
        Amount: '50',
        Currency: 'USD',
        Payer: 'Alice',
        Payee: 'Bob',
        Type: 'expense',
        entry_id: 'M01',
        'توضیح': 'Chinese restaurant'
      }];
      const result = transformCsvToExpenses(rows, mapping, [], participants, currencies, []);
      expect(result.journalEntries[0].localNotes).toBe('Chinese restaurant');
    });
  });

  describe('mergeJournalEntries', () => {
    it('replaces existing entries with same journalId', () => {
      const existing = [
        { journalId: 'J001', entryType: 'expense', status: 'imported' as const, linkedExpenseId: 'e-1',
          entryId: '', sourceFile: '', date: '', description: '', payer: '', payee: '', currency: '',
          amount: 10, flag: '', notes: '', localNotes: '', skipReason: '' }
      ];
      const incoming = [
        { journalId: 'J001', entryType: 'expense', status: 'skipped' as const, linkedExpenseId: null,
          entryId: '', sourceFile: '', date: '', description: '', payer: '', payee: '', currency: '',
          amount: 10, flag: '', notes: '', localNotes: '', skipReason: 'Duplicate' },
        { journalId: 'J002', entryType: 'transfer', status: 'skipped' as const, linkedExpenseId: null,
          entryId: '', sourceFile: '', date: '', description: '', payer: '', payee: '', currency: '',
          amount: 0, flag: '', notes: '', localNotes: '', skipReason: 'Non-expense' }
      ];
      const merged = mergeJournalEntries(existing, incoming);
      expect(merged).toHaveLength(2);
      expect(merged.find(j => j.journalId === 'J001')?.status).toBe('skipped');
      expect(merged.find(j => j.journalId === 'J002')).toBeTruthy();
    });
  });
});
