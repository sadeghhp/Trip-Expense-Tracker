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
