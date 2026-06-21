import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseFlexibleDate,
  extractUniqueNames,
  extractUniqueCurrencies,
  getSymbolForCurrency,
  transformCsvToExpenses
} from './csv-transformer';
import type { ColumnMapping } from './csv-mapper';
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

  it('skips non-importable entry types', () => {
    const rows = [{ Payer: 'Alice', Payee: 'Shop', Type: 'transfer' }];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous).toHaveLength(0);
  });

  it('counts ambiguous payee occurrences', () => {
    const rows = [
      { Payer: 'Alice', Payee: 'Shop', Type: 'expense', Amount: '10', Currency: 'USD' },
      { Payer: 'Alice', Payee: 'Shop', Type: 'expense', Amount: '20', Currency: 'USD' }
    ];
    const result = extractUniqueNames(rows, baseMapping);
    expect(result.ambiguous.find(a => a.name === 'Shop')?.occurrences).toBe(2);
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

  it('personal expense only payer is beneficiary', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Solo', Amount: '20', Currency: 'USD', Payer: 'Alice', Payee: 'هزینه شخصی', Type: 'expense_personal' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toEqual([
      { participantId: 'p-1', customAmount: null, customPercentage: null }
    ]);
  });

  it('resolves pipe-separated payees', () => {
    const rows = [{ Date: '2024-06-15', Description: 'Split', Amount: '60', Currency: 'USD', Payer: 'Alice', Payee: 'Alice|Bob', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
  });

  it('defaults to all participants for unresolvable payee', () => {
    const rows = [{ Date: '2024-06-15', Description: 'X', Amount: '10', Currency: 'USD', Payer: 'Alice', Payee: 'Unknown', Type: 'expense' }];
    const result = transformCsvToExpenses(rows, baseMapping, [], participants, currencies, []);
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
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
});
