import { describe, it, expect } from 'vitest';
import {
  buildPendingItemsFromJournalEntries,
  buildRawDataByJournalId,
  extractDescriptionPayeeNames
} from './pending-import';
import type { CsvJournalEntry } from '../types';

describe('pending-import helpers', () => {
  const rows = [
  {
    journal_id: 'J1',
    Date: '2024-06-15',
    Description: 'Lunch',
    Amount: '50',
    Currency: 'USD',
    Payer: 'Alice',
    Payee: 'Bob',
    Type: 'expense'
  },
  {
    journal_id: 'J2',
    Date: 'bad',
    Description: 'Dinner',
    Amount: '0',
    Currency: 'USD',
    Payer: 'Alice',
    Payee: 'Bob',
    Type: 'expense'
  }
];

  const mapping = {
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
    currency: 'Currency',
    payer: 'Payer',
    payee: 'Payee',
    entryType: 'Type',
    id: 'journal_id',
    flag: null,
    notes: null,
  treat: null
  };

  const entries: CsvJournalEntry[] = [
    {
      journalId: 'J1',
      entryId: '',
      sourceFile: '',
      entryType: 'expense',
      date: '2024-06-15',
      description: 'Lunch',
      payer: 'Alice',
      payee: 'Bob',
      currency: 'USD',
      amount: 50,
      flag: '',
      notes: '',
      localNotes: '',
      linkedExpenseId: 'e-1',
      status: 'imported',
      skipReason: ''
    },
    {
      journalId: 'J2',
      entryId: '',
      sourceFile: '',
      entryType: 'expense',
      date: 'bad',
      description: 'Dinner',
      payer: 'Alice',
      payee: 'Bob',
      currency: 'USD',
      amount: 0,
      flag: '',
      notes: '',
      localNotes: '',
      linkedExpenseId: null,
      status: 'skipped',
      skipReason: 'Invalid amount'
    }
  ];

  it('buildRawDataByJournalId maps journal ids to row data', () => {
    const map = buildRawDataByJournalId(rows, mapping);
    expect(map.get('J1')?.Description).toBe('Lunch');
    expect(map.get('J2')?.Description).toBe('Dinner');
  });

  it('buildPendingItemsFromJournalEntries creates items for skipped rows only', () => {
    const items = buildPendingItemsFromJournalEntries(rows, entries, mapping);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('Invalid amount');
    expect(items[0].rawData.Description).toBe('Dinner');
    expect(items[0].description).toBe('Dinner');
  });

  it('extractDescriptionPayeeNames collects description mappings', () => {
    const names = extractDescriptionPayeeNames([
      { csvName: 'Alice', isDescription: false },
      { csvName: 'Excursion', isDescription: true }
    ]);
    expect(names).toEqual(['Excursion']);
  });
});
