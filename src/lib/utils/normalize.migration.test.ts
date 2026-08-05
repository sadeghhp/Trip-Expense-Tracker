/**
 * Persistence migration tests.
 *
 * Existing stores may contain Jalali dates (H4) and dangling journal links
 * (H1/H7) written by earlier versions. Loading must canonicalize and repair
 * them without touching data that is already correct.
 */
import { describe, it, expect } from 'vitest';
import { normalizeData, normalizeAppState } from './normalize';
import { findLinkageIssues } from '../domain/journal-link';
import type { AppData } from '../types';

const participants = [
  { id: 'p-1', name: 'Alice' },
  { id: 'p-2', name: 'Bob' }
];
const currencies = [{ code: 'USD', symbol: '$' }];

function raw(overrides: Record<string, unknown> = {}) {
  return {
    participants,
    currencies,
    expenses: [],
    journals: [],
    pendingImports: [],
    exchangeRates: {},
    settlementCurrency: 'USD',
    ...overrides
  };
}

function expense(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    date: '2024-06-15',
    description: 'Lunch',
    currencyCode: 'USD',
    amount: 100,
    paidBy: 'p-1',
    splitType: 'equal',
    beneficiaries: [
      { participantId: 'p-1', customAmount: null, customPercentage: null },
      { participantId: 'p-2', customAmount: null, customPercentage: null }
    ],
    ...overrides
  };
}

describe('date migration on load', () => {
  it('migrates a stored Jalali expense date to Gregorian', () => {
    const data = normalizeData(raw({ expenses: [expense({ date: '1403-05-12' })] }));
    expect(data.expenses[0].date).toBe('2024-08-02');
  });

  it('leaves an existing Gregorian date untouched', () => {
    const data = normalizeData(raw({ expenses: [expense({ date: '2024-06-15' })] }));
    expect(data.expenses[0].date).toBe('2024-06-15');
  });

  it('is idempotent across repeated loads', () => {
    const once = normalizeData(raw({ expenses: [expense({ date: '1403-05-12' })] }));
    const twice = normalizeData(once);
    expect(twice.expenses[0].date).toBe(once.expenses[0].date);
    expect(twice.expenses[0].date).toBe('2024-08-02');
  });

  it('does not rewrite a Jalali-looking date that is not a real Jalali day', () => {
    // 1402 is not a leap year, so 12-30 does not exist; leave it alone rather
    // than inventing a conversion.
    const data = normalizeData(raw({ expenses: [expense({ date: '1402-12-30' })] }));
    expect(data.expenses[0].date).toBe('1402-12-30');
  });

  it('migrates journal and pending-import dates too', () => {
    const data = normalizeData(
      raw({
        journals: [
          {
            id: 'j-1',
            journalId: 'J-1',
            rawData: {},
            date: '1403-05-12',
            description: 'Lunch',
            amount: 100,
            currencyCode: 'USD',
            payerName: 'Alice',
            payeeName: 'گروه',
            entryType: 'expense',
            status: 'pending',
            expenseId: null,
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pendingImports: [
          {
            id: 'pi-1',
            rawData: {},
            reason: 'Unknown payer',
            createdAt: '2024-01-01T00:00:00.000Z',
            date: '1403-05-12'
          }
        ]
      })
    );

    expect(data.journals[0].date).toBe('2024-08-02');
    expect(data.pendingImports[0].date).toBe('2024-08-02');
  });

  it('migrates the CSV audit trail dates', () => {
    const data = normalizeData(
      raw({
        expenses: [expense()],
        journalEntries: [
          {
            journalId: 'J-1',
            entryId: '',
            sourceFile: '',
            entryType: 'expense',
            date: '1403-05-12',
            description: 'Lunch',
            payer: 'Alice',
            payee: 'گروه',
            currency: 'USD',
            amount: 100,
            flag: '',
            notes: '',
            localNotes: '',
            linkedExpenseId: 'e-1',
            status: 'imported',
            skipReason: ''
          }
        ]
      })
    );
    expect(data.journalEntries?.[0].date).toBe('2024-08-02');
  });

  it('produces a single sortable timeline after migration', () => {
    const data = normalizeData(
      raw({
        expenses: [
          expense({ id: 'e-jalali', date: '1403-05-12' }), // 2024-08-02
          expense({ id: 'e-greg', date: '2024-07-01' })
        ]
      })
    );
    const sorted = [...data.expenses].sort((a, b) => a.date.localeCompare(b.date));
    expect(sorted.map(e => e.id)).toEqual(['e-greg', 'e-jalali']);
  });
});

describe('linkage repair on load', () => {
  it('unlinks a journal whose expense no longer exists', () => {
    const data = normalizeData(
      raw({
        expenses: [],
        journals: [
          {
            id: 'j-1',
            journalId: 'J-1',
            rawData: {},
            date: '2024-06-15',
            description: 'Lunch',
            amount: 100,
            currencyCode: 'USD',
            payerName: 'Alice',
            payeeName: 'گروه',
            entryType: 'expense',
            status: 'applied',
            expenseId: 'gone',
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      })
    );

    expect(data.journals[0].expenseId).toBeNull();
    // An applied journal with no expense is out of sync, not applied.
    expect(data.journals[0].status).toBe('out_of_sync');
    expect(findLinkageIssues(data)).toEqual([]);
  });

  it('drops an expense reference to a journal that no longer exists', () => {
    const data = normalizeData(
      raw({ expenses: [expense({ journalEntryId: 'missing-journal', source: 'journal' })] })
    );
    expect(data.expenses[0].journalEntryId).toBeUndefined();
    expect(findLinkageIssues(data)).toEqual([]);
  });

  it('restores a missing back-reference from the journal side', () => {
    const data = normalizeData(
      raw({
        expenses: [expense()], // no journalEntryId, as the CSV wizard used to produce
        journals: [
          {
            id: 'j-1',
            journalId: 'J-1',
            rawData: {},
            date: '2024-06-15',
            description: 'Lunch',
            amount: 100,
            currencyCode: 'USD',
            payerName: 'Alice',
            payeeName: 'گروه',
            entryType: 'expense',
            status: 'applied',
            expenseId: 'e-1',
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      })
    );

    expect(data.expenses[0].journalEntryId).toBe('j-1');
    expect(data.expenses[0].source).toBe('journal');
    expect(findLinkageIssues(data)).toEqual([]);
  });

  it('clears an audit link that points at a deleted expense', () => {
    const data = normalizeData(
      raw({
        expenses: [],
        journalEntries: [
          {
            journalId: 'J-1',
            entryId: '',
            sourceFile: '',
            entryType: 'expense',
            date: '2024-06-15',
            description: 'Lunch',
            payer: 'Alice',
            payee: 'گروه',
            currency: 'USD',
            amount: 100,
            flag: '',
            notes: '',
            localNotes: '',
            linkedExpenseId: 'gone',
            status: 'imported',
            skipReason: ''
          }
        ]
      })
    );
    expect(data.journalEntries?.[0].linkedExpenseId).toBeNull();
    expect(findLinkageIssues(data)).toEqual([]);
  });

  it('accepts the excluded journal status', () => {
    const data = normalizeData(
      raw({
        journals: [
          {
            id: 'j-1',
            journalId: 'J-1',
            rawData: {},
            date: '2024-06-15',
            description: 'Withdrawal',
            amount: 100,
            currencyCode: 'USD',
            payerName: 'Alice',
            payeeName: 'Bob',
            entryType: 'withdrawal',
            status: 'excluded',
            expenseId: null,
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      })
    );
    expect(data.journals).toHaveLength(1);
    expect(data.journals[0].status).toBe('excluded');
  });
});

describe('id integrity on load', () => {
  it('drops duplicate expense ids that would crash the keyed list', () => {
    const data = normalizeData(
      raw({ expenses: [expense({ id: 'dupe' }), expense({ id: 'dupe', amount: 50 })] })
    );
    expect(data.expenses).toHaveLength(1);
  });

  it('drops duplicate participant ids', () => {
    const data = normalizeData(
      raw({ participants: [...participants, { id: 'p-1', name: 'Alice Clone' }] })
    );
    expect(data.participants).toHaveLength(2);
  });

  it('preserves the pending-import journalId used for de-duplication', () => {
    const data = normalizeData(
      raw({
        pendingImports: [
          {
            id: 'pi-1',
            journalId: 'J-9',
            rawData: {},
            reason: 'Unknown payer',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      })
    );
    expect(data.pendingImports[0].journalId).toBe('J-9');
  });
});

describe('normalizeAppState', () => {
  it('migrates dates inside every trip', () => {
    const state = normalizeAppState({
      trips: [
        {
          id: 't-1',
          name: 'Trip',
          data: raw({ expenses: [expense({ date: '1403-05-12' })] })
        }
      ],
      activeTripId: 't-1'
    });
    expect(state.trips[0].data.expenses[0].date).toBe('2024-08-02');
  });
});
