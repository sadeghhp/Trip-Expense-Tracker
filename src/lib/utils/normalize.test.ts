import { describe, it, expect } from 'vitest';
import { normalizeData, normalizeAppState, stripReceiptImageIds } from './normalize';
import { makeAppData, makeExpense, makeBeneficiary } from '../../test/factories';

describe('normalizeData', () => {
  it('returns empty structure for null input', () => {
    const result = normalizeData(null);
    expect(result).toEqual({
      participants: [],
      currencies: [],
      expenses: [],
      journals: [],
      pendingImports: [],
      exchangeRates: {},
      settlementCurrency: ''
    });
  });

  it('returns empty structure for undefined input', () => {
    expect(normalizeData(undefined).participants).toEqual([]);
  });

  it('filters participants without id or name', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }, { id: 'p-2' }, { name: 'Bob' }],
      currencies: [],
      expenses: []
    });
    expect(result.participants).toHaveLength(1);
  });

  it('filters currencies without code or symbol', () => {
    const result = normalizeData({
      participants: [],
      currencies: [{ code: 'USD', symbol: '$' }, { code: 'EUR' }],
      expenses: []
    });
    expect(result.currencies).toHaveLength(1);
  });

  it('removes beneficiaries referencing non-existent participants', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'equal',
        beneficiaries: [
          { participantId: 'p-1', customAmount: null, customPercentage: null },
          { participantId: 'p-missing', customAmount: null, customPercentage: null }
        ]
      }]
    });
    expect(result.expenses[0].beneficiaries).toHaveLength(1);
  });

  it('removes expenses with invalid payer', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-missing',
        splitType: 'equal',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }]
    });
    expect(result.expenses).toHaveLength(0);
  });

  it('removes expenses with invalid currency', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'EUR',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'equal',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }]
    });
    expect(result.expenses).toHaveLength(0);
  });

  it('removes zero or invalid amounts', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 0,
        paidBy: 'p-1',
        splitType: 'equal',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }]
    });
    expect(result.expenses).toHaveLength(0);
  });

  it('normalizes NaN customAmount to null', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'custom',
        beneficiaries: [{ participantId: 'p-1', customAmount: NaN, customPercentage: Infinity }]
      }]
    });
    expect(result.expenses[0].beneficiaries[0].customAmount).toBeNull();
    expect(result.expenses[0].beneficiaries[0].customPercentage).toBeNull();
  });

  it('defaults invalid splitType to equal', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'invalid',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }]
    });
    expect(result.expenses[0].splitType).toBe('equal');
  });

  it('preserves isTreat when true', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Drinks',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'equal',
        isTreat: true,
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }]
    });
    expect(result.expenses[0].isTreat).toBe(true);
  });

  it('strips invalid isTreat values', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'equal',
        isTreat: 'yes',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }]
    });
    expect(result.expenses[0].isTreat).toBeUndefined();
  });

  it('cleans invalid exchange rates', () => {
    const result = normalizeData({
      participants: [],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [],
      exchangeRates: { USD: 1, EUR: -1, GBP: 0, JPY: 'bad' }
    });
    expect(result.exchangeRates).toEqual({ USD: 1 });
  });

  it('clears settlement currency if not in currencies', () => {
    const result = normalizeData({
      participants: [],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [],
      settlementCurrency: 'EUR'
    });
    expect(result.settlementCurrency).toBe('');
  });

  it('coerces string amounts to numbers', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: '50',
        paidBy: 'p-1',
        splitType: 'equal',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }]
    });
    expect(result.expenses[0].amount).toBe(50);
  });

  it('passes through valid complete data', () => {
    const data = makeAppData({
      expenses: [makeExpense({ id: 'e-1', paidBy: 'p-1', beneficiaries: [makeBeneficiary('p-1')] })]
    });
    const result = normalizeData(data);
    expect(result.participants).toHaveLength(2);
    expect(result.expenses).toHaveLength(1);
  });

  it('preserves valid tankhahParticipantId', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }, { id: 'p-2', name: 'Bob' }],
      currencies: [],
      expenses: [],
      tankhahParticipantId: 'p-1'
    });
    expect(result.tankhahParticipantId).toBe('p-1');
  });

  it('clears tankhahParticipantId referencing non-existent participant', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [],
      expenses: [],
      tankhahParticipantId: 'p-missing'
    });
    expect(result.tankhahParticipantId).toBeUndefined();
  });

  it('omits tankhahParticipantId when not set', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [],
      expenses: []
    });
    expect(result.tankhahParticipantId).toBeUndefined();
  });

  it('clears non-string tankhahParticipantId', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [],
      expenses: [],
      tankhahParticipantId: 42
    });
    expect(result.tankhahParticipantId).toBeUndefined();
  });

  it('normalizes journal entries and clears orphaned expense links', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'equal',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }],
      journalEntries: [
        {
          journalId: 'J001',
          entryType: 'expense',
          status: 'imported',
          linkedExpenseId: 'e-1',
          amount: 100
        },
        {
          journalId: 'J002',
          entryType: 'transfer',
          status: 'skipped',
          linkedExpenseId: 'e-missing',
          amount: 50
        },
        { journalId: '', status: 'imported' }
      ]
    });
    expect(result.journalEntries).toHaveLength(2);
    expect(result.journalEntries![0].linkedExpenseId).toBe('e-1');
    expect(result.journalEntries![1].linkedExpenseId).toBeNull();
  });

  it('normalizes actionable journals with referential integrity', () => {
    const result = normalizeData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      currencies: [{ code: 'USD', symbol: '$' }],
      expenses: [{
        id: 'e-1',
        date: '2024-01-01',
        description: 'Test',
        currencyCode: 'USD',
        amount: 100,
        paidBy: 'p-1',
        splitType: 'equal',
        beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
      }],
      journals: [
        {
          id: 'j-1',
          journalId: 'J001',
          rawData: {},
          date: '2024-01-01',
          description: 'Valid',
          amount: 50,
          currencyCode: 'USD',
          payerName: 'Alice',
          payeeName: 'Alice',
          entryType: 'expense',
          status: 'applied',
          expenseId: 'e-1',
          updatedAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'j-2',
          status: 'invalid',
          amount: 10
        },
        {
          id: 'j-3',
          journalId: 'J003',
          rawData: {},
          date: '2024-01-01',
          description: 'Orphan link',
          amount: 20,
          currencyCode: 'USD',
          payerName: 'Alice',
          payeeName: 'Alice',
          entryType: 'expense',
          status: 'pending',
          expenseId: 'e-missing',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    });
    expect(result.journals).toHaveLength(2);
    expect(result.journals[0].expenseId).toBe('e-1');
    expect(result.journals[1].expenseId).toBeNull();
  });

  it('filters invalid journal entry status', () => {
    const result = normalizeData({
      participants: [],
      currencies: [],
      expenses: [],
      journalEntries: [{ journalId: 'J001', status: 'invalid', entryType: 'x' }]
    });
    expect(result.journalEntries).toBeUndefined();
  });
});

describe('normalizeAppState', () => {
  it('returns empty state for null', () => {
    expect(normalizeAppState(null)).toEqual({ trips: [], activeTripId: null });
  });

  it('filters invalid trips', () => {
    const result = normalizeAppState({
      trips: [
        { id: 't-1', name: 'Valid', data: makeAppData() },
        { id: 't-2', name: 'No data' },
        { name: 'No id', data: makeAppData() }
      ],
      activeTripId: 't-1'
    });
    expect(result.trips).toHaveLength(1);
  });

  it('clears activeTripId if not matching any trip', () => {
    const result = normalizeAppState({
      trips: [{ id: 't-1', name: 'Trip', data: makeAppData() }],
      activeTripId: 'missing'
    });
    expect(result.activeTripId).toBeNull();
  });

  it('preserves valid activeTripId', () => {
    const result = normalizeAppState({
      trips: [{ id: 't-1', name: 'Trip', data: makeAppData() }],
      activeTripId: 't-1'
    });
    expect(result.activeTripId).toBe('t-1');
  });

  it('applies defaults for optional trip fields', () => {
    const result = normalizeAppState({
      trips: [{ id: 't-1', name: 'Trip', data: makeAppData() }],
      activeTripId: null
    });
    const trip = result.trips[0];
    expect(trip.description).toBe('');
    expect(trip.archived).toBe(false);
    expect(trip.createdAt).toBeTruthy();
  });

  it('deduplicates trips by id, keeping last occurrence', () => {
    const result = normalizeAppState({
      trips: [
        { id: 't-1', name: 'First', data: makeAppData() },
        { id: 't-2', name: 'Other', data: makeAppData() },
        { id: 't-1', name: 'Duplicate', data: makeAppData() }
      ],
      activeTripId: 't-1'
    });
    expect(result.trips).toHaveLength(2);
    expect(result.trips.find(t => t.id === 't-1')?.name).toBe('Duplicate');
  });
});

describe('stripReceiptImageIds', () => {
  it('removes receiptImageId from expenses', () => {
    const data = makeAppData({
      expenses: [
        makeExpense({ receiptImageId: 'img-1' }),
        makeExpense({ id: 'e-2' })
      ]
    });
    const result = stripReceiptImageIds(data);
    expect(result.expenses[0].receiptImageId).toBeUndefined();
    expect(result.expenses[1]).not.toHaveProperty('receiptImageId');
  });

  it('preserves other expense fields', () => {
    const data = makeAppData({
      expenses: [makeExpense({ id: 'e-1', amount: 42, receiptImageId: 'img-1' })]
    });
    const result = stripReceiptImageIds(data);
    expect(result.expenses[0].amount).toBe(42);
    expect(result.expenses[0].id).toBe('e-1');
  });
});
