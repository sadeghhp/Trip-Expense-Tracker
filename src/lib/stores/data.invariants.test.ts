/**
 * Store-level invariant tests.
 *
 * Covers the pending-review persistence guarantee (C1), the atomic settlement
 * currency switch (C3), receipt-image ownership isolation (H6) and the
 * journal/expense linkage rules (H7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const { duplicateMock, deleteMock, existingMock } = vi.hoisted(() => ({
  duplicateMock: vi.fn(
    async (idMap: Map<string, string>): Promise<{ copied: string[]; missing: string[] }> => ({
      copied: [...idMap.keys()],
      missing: []
    })
  ),
  deleteMock: vi.fn().mockResolvedValue(undefined),
  existingMock: vi.fn(async (ids: string[]) => new Set(ids))
}));

vi.mock('../services/imageStore', () => ({
  deleteReceiptImages: deleteMock,
  duplicateReceiptImages: duplicateMock,
  existingReceiptImageIds: existingMock
}));

import {
  createTrip,
  updateData,
  appData,
  addExpense,
  updateExpense,
  changeSettlementCurrency,
  removeCurrency,
  applyJournalEntry,
  applyAllPendingJournals,
  deleteJournalEntry,
  unlinkJournalsOnExpenseDelete,
  upsertJournalEntries,
  replaceData,
  duplicateTrip,
  trips,
  activeTripId
} from './data';
import { buildExpenseFromPendingItem } from '../utils/pending-import';
import { findLinkageIssues } from '../domain/journal-link';
import type { Expense, JournalEntry, PendingImportItem } from '../types';

function seed() {
  updateData(d => ({
    ...d,
    participants: [
      { id: 'p-1', name: 'Alice' },
      { id: 'p-2', name: 'Bob' }
    ],
    currencies: [
      { code: 'USD', symbol: '$' },
      { code: 'EUR', symbol: '€' },
      { code: 'IRR', symbol: '﷼' }
    ],
    settlementCurrency: 'USD',
    exchangeRates: { EUR: 0.9 }
  }));
}

function makeStoredExpense(overrides: Partial<Expense> = {}): Expense {
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

function makeStoredJournal(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
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
    status: 'pending',
    expenseId: null,
    updatedAt: '2024-06-15T00:00:00.000Z',
    ...overrides
  };
}

describe('data store invariants', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    createTrip('Invariants Trip');
    seed();
  });

  describe('addExpense (pending-review persistence)', () => {
    it('adds exactly one expense and confirms it landed', () => {
      const result = addExpense(makeStoredExpense());
      expect(result.success).toBe(true);
      expect(result.expenseId).toBe('e-1');
      expect(get(appData).expenses).toHaveLength(1);
    });

    it('refuses an expense with an empty id instead of silently dropping it', () => {
      // The prefill used to carry id: '' and vanish while the wizard reported
      // "1 added".
      const result = addExpense(makeStoredExpense({ id: '' }));
      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_id');
      expect(get(appData).expenses).toHaveLength(0);
    });

    it('refuses a duplicate id rather than creating a twin', () => {
      addExpense(makeStoredExpense());
      const result = addExpense(makeStoredExpense());
      expect(result.success).toBe(false);
      expect(result.error).toBe('duplicate_id');
      expect(get(appData).expenses).toHaveLength(1);
    });

    it('buildExpenseFromPendingItem always yields a persistable id', () => {
      const item: PendingImportItem = {
        id: 'pending-1',
        rawData: {},
        reason: 'Unknown payer: Carol',
        createdAt: '2024-06-15T00:00:00.000Z',
        date: '2024-06-15',
        description: 'Dinner',
        amount: 40,
        currencyCode: 'USD',
        payerName: 'Alice'
      };
      const data = get(appData);
      const prefill = buildExpenseFromPendingItem(item, data.participants, data.currencies);

      expect(prefill.id).toBeTruthy();
      const result = addExpense(prefill);
      expect(result.success).toBe(true);
      expect(get(appData).expenses).toHaveLength(1);
    });

    it('leaves the payer empty when the CSV name cannot be resolved', () => {
      // Defaulting to participants[0] silently booked expenses against the
      // wrong person.
      const item: PendingImportItem = {
        id: 'pending-2',
        rawData: {},
        reason: 'Unknown payer: Carol',
        createdAt: '2024-06-15T00:00:00.000Z',
        payerName: 'Carol'
      };
      const data = get(appData);
      const prefill = buildExpenseFromPendingItem(item, data.participants, data.currencies);
      expect(prefill.paidBy).toBe('');
    });
  });

  describe('updateExpense and out-of-sync marking', () => {
    function seedLinked() {
      const expense = makeStoredExpense({ journalEntryId: 'j-1', source: 'journal' });
      updateData(d => ({
        ...d,
        expenses: [expense],
        journals: [makeStoredJournal({ status: 'applied', expenseId: 'e-1' })]
      }));
      return expense;
    }

    it('marks the journal out of sync when a mirrored field changes', () => {
      const expense = seedLinked();
      updateExpense('e-1', { ...expense, amount: 250 });
      expect(get(appData).journals[0].status).toBe('out_of_sync');
    });

    it('does NOT mark out of sync when nothing relevant changed', () => {
      // Opening the edit form and pressing Update used to flip the journal.
      const expense = seedLinked();
      updateExpense('e-1', { ...expense });
      expect(get(appData).journals[0].status).toBe('applied');
    });

    it('does not mark out of sync for a receipt-only change', () => {
      const expense = seedLinked();
      updateExpense('e-1', { ...expense, receiptImageId: 'img-9' });
      expect(get(appData).journals[0].status).toBe('applied');
    });

    it('marks out of sync when beneficiaries change', () => {
      const expense = seedLinked();
      updateExpense('e-1', {
        ...expense,
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      });
      expect(get(appData).journals[0].status).toBe('out_of_sync');
    });

    it('reports failure for an unknown expense', () => {
      expect(updateExpense('missing', makeStoredExpense()).success).toBe(false);
    });
  });

  describe('journal apply and linkage', () => {
    it('links both sides and the audit trail on apply', () => {
      upsertJournalEntries([makeStoredJournal()]);
      const result = applyJournalEntry('j-1');
      expect(result.success).toBe(true);

      const data = get(appData);
      const journal = data.journals.find(j => j.id === 'j-1');
      const expense = data.expenses.find(e => e.id === journal?.expenseId);
      expect(expense).toBeDefined();
      expect(expense?.journalEntryId).toBe('j-1');
      expect(expense?.source).toBe('journal');
      expect(findLinkageIssues(data)).toEqual([]);
    });

    it('refuses to materialise a currency exchange and marks it excluded', () => {
      upsertJournalEntries([makeStoredJournal({ entryType: 'currency_exchange', payeeName: 'Bob' })]);
      const result = applyJournalEntry('j-1');

      expect(result.success).toBe(false);
      expect(get(appData).expenses).toHaveLength(0);
      expect(get(appData).journals[0].status).toBe('excluded');
    });

    it('applies a withdrawal as an obligation (payee owes the fund)', () => {
      upsertJournalEntries([makeStoredJournal({ entryType: 'withdrawal', payeeName: 'Bob' })]);
      const result = applyJournalEntry('j-1');

      expect(result.success).toBe(true);
      const expense = get(appData).expenses[0];
      expect(expense.beneficiaries.map(b => b.participantId)).toEqual(['p-2']);
    });

    it('Apply All applies obligations but skips internal-op rows', () => {
      upsertJournalEntries([
        makeStoredJournal({ id: 'j-1', journalId: 'J-1', entryType: 'expense' }),
        makeStoredJournal({ id: 'j-2', journalId: 'J-2', entryType: 'withdrawal', payeeName: 'Bob' }),
        makeStoredJournal({ id: 'j-3', journalId: 'J-3', entryType: 'currency_exchange' })
      ]);

      const result = applyAllPendingJournals();
      expect(result.applied).toBe(2);
      expect(result.excluded).toBe(1);
      expect(get(appData).expenses).toHaveLength(2);
    });

    it('Apply All is idempotent', () => {
      upsertJournalEntries([makeStoredJournal()]);
      applyAllPendingJournals();
      const afterFirst = get(appData).expenses.length;
      applyAllPendingJournals();
      expect(get(appData).expenses).toHaveLength(afterFirst);
    });

    it('clears the audit link when a journal is deleted', () => {
      upsertJournalEntries([makeStoredJournal()]);
      applyJournalEntry('j-1');
      updateData(d => ({
        ...d,
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
            linkedExpenseId: d.journals[0].expenseId,
            status: 'imported' as const,
            skipReason: ''
          }
        ]
      }));

      deleteJournalEntry('j-1');

      const data = get(appData);
      expect(data.journalEntries?.[0].linkedExpenseId).toBeNull();
      expect(data.journalEntries?.[0].status).toBe('skipped');
    });

    it('unlinks both sides and the audit when the expense is deleted', () => {
      upsertJournalEntries([makeStoredJournal()]);
      applyJournalEntry('j-1');
      const expenseId = get(appData).journals[0].expenseId as string;

      updateData(d => ({
        ...d,
        expenses: d.expenses.filter(e => e.id !== expenseId),
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
            linkedExpenseId: expenseId,
            status: 'imported' as const,
            skipReason: ''
          }
        ]
      }));
      unlinkJournalsOnExpenseDelete(expenseId, 'j-1');

      const data = get(appData);
      expect(data.journals[0].expenseId).toBeNull();
      expect(data.journals[0].status).toBe('out_of_sync');
      expect(data.journalEntries?.[0].linkedExpenseId).toBeNull();
    });
  });

  describe('settlement currency changes', () => {
    it('re-bases rates through a valid pivot', () => {
      const result = changeSettlementCurrency('EUR');
      expect(result.ok).toBe(true);

      const data = get(appData);
      expect(data.settlementCurrency).toBe('EUR');
      expect(data.exchangeRates['USD']).toBeCloseTo(1 / 0.9, 6);
      expect(data.exchangeRates['EUR']).toBeUndefined();
    });

    it('refuses the switch when no pivot exists, leaving state untouched', () => {
      const before = get(appData);
      const result = changeSettlementCurrency('IRR');

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no_pivot_rate');
      const after = get(appData);
      expect(after.settlementCurrency).toBe(before.settlementCurrency);
      expect(after.exchangeRates).toEqual(before.exchangeRates);
    });

    it('force clears incompatible rates rather than keeping a wrong base', () => {
      const result = changeSettlementCurrency('IRR', { force: true });
      expect(result.ok).toBe(true);
      expect(result.clearedRates).toEqual(['EUR']);

      const data = get(appData);
      expect(data.settlementCurrency).toBe('IRR');
      expect(data.exchangeRates['EUR']).toBeUndefined();
    });

    it('never persists a currency alongside stale-base rates', () => {
      for (const code of ['EUR', 'IRR', 'USD']) {
        changeSettlementCurrency(code, { force: true });
        const data = get(appData);
        // The settlement currency itself never carries a rate.
        expect(data.exchangeRates[data.settlementCurrency]).toBeUndefined();
      }
    });

    it('removing the settlement currency keeps the invariant', () => {
      updateData(d => ({ ...d, exchangeRates: { EUR: 0.9, IRR: 42000 } }));
      removeCurrency('USD');

      const data = get(appData);
      expect(data.currencies.some(c => c.code === 'USD')).toBe(false);
      expect(data.settlementCurrency).toBe('EUR');
      expect(data.exchangeRates['IRR']).toBeCloseTo(42000 / 0.9, 4);
      expect(data.exchangeRates['EUR']).toBeUndefined();
    });

    it('removing the settlement currency clears rates it cannot re-base', () => {
      updateData(d => ({ ...d, exchangeRates: { IRR: 42000 } }));
      const { clearedRates } = removeCurrency('USD');

      const data = get(appData);
      expect(data.settlementCurrency).toBe('EUR');
      expect(data.exchangeRates).toEqual({});
      expect(clearedRates).toContain('IRR');
    });
  });

  describe('receipt image ownership', () => {
    it('re-keys image ids on replace-mode import so trips never share a blob', async () => {
      await replaceData({
        participants: [{ id: 'p-1', name: 'Alice' }],
        currencies: [{ code: 'USD', symbol: '$' }],
        expenses: [makeStoredExpense({ receiptImageId: 'shared-img' })],
        journals: [],
        pendingImports: [],
        exchangeRates: {},
        settlementCurrency: 'USD'
      });

      const imported = get(appData).expenses[0];
      expect(imported.receiptImageId).toBeDefined();
      expect(imported.receiptImageId).not.toBe('shared-img');
      expect(duplicateMock).toHaveBeenCalled();
    });

    it('drops the reference when the source blob is unavailable', async () => {
      duplicateMock.mockResolvedValueOnce({ copied: [], missing: ['gone-img'] });

      await replaceData({
        participants: [{ id: 'p-1', name: 'Alice' }],
        currencies: [{ code: 'USD', symbol: '$' }],
        expenses: [makeStoredExpense({ receiptImageId: 'gone-img' })],
        journals: [],
        pendingImports: [],
        exchangeRates: {},
        settlementCurrency: 'USD'
      });

      expect(get(appData).expenses[0].receiptImageId).toBeUndefined();
    });

    it('duplicating a trip succeeds even when one blob is missing', async () => {
      updateData(d => ({
        ...d,
        expenses: [
          makeStoredExpense({ id: 'e-1', receiptImageId: 'img-ok' }),
          makeStoredExpense({ id: 'e-2', receiptImageId: 'img-gone' })
        ]
      }));
      duplicateMock.mockResolvedValueOnce({ copied: ['img-ok'], missing: ['img-gone'] });

      const tripId = get(activeTripId) as string;
      await duplicateTrip(tripId);

      const copy = get(trips).find(t => t.name.includes('(Copy)'));
      expect(copy).toBeDefined();
      const copied = copy?.data.expenses ?? [];
      expect(copied.find(e => e.id === 'e-1')?.receiptImageId).toBeDefined();
      expect(copied.find(e => e.id === 'e-1')?.receiptImageId).not.toBe('img-ok');
      expect(copied.find(e => e.id === 'e-2')?.receiptImageId).toBeUndefined();
    });
  });
});
