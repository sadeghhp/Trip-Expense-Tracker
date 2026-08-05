/**
 * Import of "raw" tankhah ledgers: description,payer,payee,currency,amount,treat
 * with NO date, NO entry-type and NO id column. Mirrors the structure of the
 * real feas-china raw export (synthetic data only).
 */
import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv-parser';
import { detectColumnMapping } from './csv-mapper';
import {
  transformCsvToExpenses,
  extractUniqueNames,
  isTreatMark,
  effectiveEntryType,
  type ParticipantMapping
} from './csv-transformer';
import { isCanonicalDate } from '../domain/dates';
import type { Participant } from '../types';

// BOM + Persian names + treat marks + no date/type/id columns.
const RAW_CSV =
  '﻿description,payer,payee,currency,amount,treat\n' +
  'قرض به تست,تنخواه,ali,CNY,5000,\n' +
  'ناهار گروهی,تنخواه,تنخواه,CNY,225,x\n' +
  'نفری صد دلار بلاعوض,تنخواه,ali,USD,100,x\n' +
  'برداشت نقدی (تکرار ثبت),تنخواه,ali,CNY,500,\n' +
  'خرید شخصی,تنخواه,rza,CNY,150,\n';

const participants: Participant[] = [
  { id: 'p-fund', name: 'تنخواه' },
  { id: 'p-ali', name: 'ali' },
  { id: 'p-rza', name: 'rza' }
];
const currencies = [
  { code: 'CNY', symbol: '¥' },
  { code: 'USD', symbol: '$' }
];

const noNewMappings: ParticipantMapping[] = [];

describe('raw ledger import (no date / type / id columns)', () => {
  const parsed = parseCsv(RAW_CSV);
  const mapping = detectColumnMapping(parsed.headers);

  it('auto-detects the treat column and leaves date unmapped', () => {
    expect(mapping.treat).toBe('treat');
    expect(mapping.date).toBeNull();
    expect(mapping.entryType).toBeNull();
  });

  it('imports date-less rows with a canonical fallback date', () => {
    const result = transformCsvToExpenses(
      parsed.rows, mapping, noNewMappings, participants, currencies, []
    );
    // 4 importable rows; the تکرار ثبت row is auto-skipped.
    expect(result.expenses).toHaveLength(4);
    for (const expense of result.expenses) {
      expect(isCanonicalDate(expense.date)).toBe(true);
    }
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].reason).toContain('تکرار ثبت');
  });

  it('marks treat-column rows as treats and leaves others regular', () => {
    const result = transformCsvToExpenses(
      parsed.rows, mapping, noNewMappings, participants, currencies, []
    );
    const byDescription = new Map(result.expenses.map(e => [e.description, e]));
    expect(byDescription.get('ناهار گروهی')?.isTreat).toBe(true);
    expect(byDescription.get('نفری صد دلار بلاعوض')?.isTreat).toBe(true);
    expect(byDescription.get('قرض به تست')?.isTreat).toBeUndefined();
    expect(byDescription.get('خرید شخصی')?.isTreat).toBeUndefined();
  });

  it('a payer==payee row without an entry type imports as a plain expense', () => {
    const result = transformCsvToExpenses(
      parsed.rows, mapping, noNewMappings, participants, currencies, []
    );
    const selfRow = result.expenses.find(e => e.description === 'ناهار گروهی');
    expect(selfRow).toBeDefined();
    expect(selfRow?.paidBy).toBe('p-fund');
  });

  it('collects payee names for participant mapping (typo merging)', () => {
    const names = extractUniqueNames(parsed.rows, mapping);
    expect(names.ambiguous.map(a => a.name)).toContain('ali');
    expect(names.ambiguous.map(a => a.name)).toContain('rza');
  });

  it('lets two spellings map to one participant', () => {
    // "esl" vs "els" in the real file: both map to the same person.
    const rows = parseCsv(
      'description,payer,payee,currency,amount\n' +
      'debt a,esl,fund,CNY,10\n' +
      'grant b,fund,els,CNY,20\n'
    );
    const m = detectColumnMapping(rows.headers);
    const people: Participant[] = [
      { id: 'p-fund', name: 'fund' },
      { id: 'p-esl', name: 'Eslami' }
    ];
    const mappings: ParticipantMapping[] = [
      { csvName: 'esl', participantId: 'p-esl', createNew: false, isDescription: false },
      { csvName: 'els', participantId: 'p-esl', createNew: false, isDescription: false }
    ];
    const result = transformCsvToExpenses(rows.rows, m, mappings, people, [{ code: 'CNY', symbol: '¥' }], []);
    expect(result.expenses).toHaveLength(2);
    expect(result.expenses[0].paidBy).toBe('p-esl');
    expect(result.expenses[1].beneficiaries[0].participantId).toBe('p-esl');
  });
});

describe('treat mark parsing', () => {
  it('treats any non-falsy value as a mark', () => {
    for (const v of ['x', 'X', 'yes', '1', 'true', '✓']) expect(isTreatMark(v)).toBe(true);
    for (const v of ['', ' ', '0', 'false', 'no', 'خیر', undefined]) expect(isTreatMark(v)).toBe(false);
  });

  it('promotes only plain-expense rows to expense_treat', () => {
    expect(effectiveEntryType('', true)).toBe('expense_treat');
    expect(effectiveEntryType('expense', true)).toBe('expense_treat');
    // A treat mark must not rewrite debts/transfers.
    expect(effectiveEntryType('debt_statement', true)).toBe('debt_statement');
    expect(effectiveEntryType('withdrawal', true)).toBe('withdrawal');
    expect(effectiveEntryType('currency_exchange', true)).toBe('currency_exchange');
    expect(effectiveEntryType('expense', false)).toBe('expense');
  });
});
