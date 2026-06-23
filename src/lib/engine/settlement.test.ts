import { describe, it, expect } from 'vitest';
import { computeUnifiedBalances, computeSettlementTransactions, recalculateExchangeRates } from './settlement';
import type { CurrencyBalances, UnifiedBalance } from '../types';
import { makeParticipant } from '../../test/factories';

describe('computeUnifiedBalances', () => {
  const participants = [
    makeParticipant({ id: 'p-1', name: 'Alice' }),
    makeParticipant({ id: 'p-2', name: 'Bob' })
  ];

  it('passes through single settlement currency', () => {
    const balances: CurrencyBalances = {
      USD: {
        'p-1': { paid: 100, owed: 50, net: 50 },
        'p-2': { paid: 0, owed: 50, net: -50 }
      }
    };
    const result = computeUnifiedBalances(balances, participants, 'USD', {});
    expect(result).toEqual([
      { id: 'p-1', name: 'Alice', balance: 50 },
      { id: 'p-2', name: 'Bob', balance: -50 }
    ]);
  });

  it('converts multiple currencies using exchange rates', () => {
    const balances: CurrencyBalances = {
      USD: { 'p-1': { paid: 100, owed: 0, net: 100 } },
      EUR: { 'p-2': { paid: 0, owed: 50, net: -50 } }
    };
    const result = computeUnifiedBalances(balances, participants, 'USD', { EUR: 2 });
    expect(result.find(p => p.id === 'p-1')?.balance).toBe(100);
    expect(result.find(p => p.id === 'p-2')?.balance).toBe(-25);
  });

  it('skips currency without valid exchange rate', () => {
    const balances: CurrencyBalances = {
      USD: { 'p-1': { paid: 100, owed: 0, net: 100 } },
      EUR: { 'p-2': { paid: 0, owed: 50, net: -50 } }
    };
    const result = computeUnifiedBalances(balances, participants, 'USD', {});
    expect(result.find(p => p.id === 'p-2')?.balance).toBe(0);
  });

  it('skips zero or negative exchange rates', () => {
    const balances: CurrencyBalances = {
      EUR: { 'p-1': { paid: 0, owed: 50, net: -50 } }
    };
    const result = computeUnifiedBalances(balances, participants, 'USD', { EUR: 0 });
    expect(result.find(p => p.id === 'p-1')?.balance).toBe(0);
  });

  it('initializes participants with zero balance', () => {
    const balances: CurrencyBalances = {};
    const result = computeUnifiedBalances(balances, participants, 'USD', {});
    expect(result.every(p => p.balance === 0)).toBe(true);
  });

  it('rounds to 2 decimal places', () => {
    const balances: CurrencyBalances = {
      EUR: { 'p-1': { paid: 0, owed: 33.33, net: -33.33 } }
    };
    const result = computeUnifiedBalances(balances, participants, 'USD', { EUR: 3 });
    const balance = result.find(p => p.id === 'p-1')?.balance ?? 0;
    expect(balance).toBe(Math.round(balance * 100) / 100);
  });
});

describe('recalculateExchangeRates', () => {
  it('returns old rates when old and new settlement are the same', () => {
    const rates = { EUR: 0.9, TRY: 32 };
    expect(recalculateExchangeRates(rates, 'USD', 'USD')).toBe(rates);
  });

  it('returns old rates when pivot rate is missing', () => {
    const rates = { EUR: 0.9 };
    expect(recalculateExchangeRates(rates, 'USD', 'TRY')).toBe(rates);
  });

  it('returns old rates when old settlement is empty', () => {
    const rates = { EUR: 0.9 };
    expect(recalculateExchangeRates(rates, '', 'EUR')).toBe(rates);
  });

  it('returns old rates when new settlement is empty', () => {
    const rates = { EUR: 0.9 };
    expect(recalculateExchangeRates(rates, 'USD', '')).toBe(rates);
  });

  it('recalculates cross-rates for two non-settlement currencies', () => {
    const rates = { CNY: 7.25, TRY: 32.5 };
    const result = recalculateExchangeRates(rates, 'USD', 'CNY');
    expect(result['TRY']).toBeCloseTo(32.5 / 7.25, 6);
    expect(result['USD']).toBeCloseTo(1 / 7.25, 6);
    expect(result['CNY']).toBeUndefined();
  });

  it('adds rate for the old settlement currency', () => {
    const rates = { EUR: 2 };
    const result = recalculateExchangeRates(rates, 'USD', 'EUR');
    expect(result['USD']).toBeCloseTo(0.5, 6);
    expect(result['EUR']).toBeUndefined();
  });

  it('preserves conversion equivalence after switch', () => {
    const rates = { CNY: 7.25, TRY: 32.5 };
    const newRates = recalculateExchangeRates(rates, 'USD', 'CNY');

    const amountTRY = 100;
    const inUSD_direct = amountTRY / rates['TRY'];
    const inCNY = amountTRY / newRates['TRY'];
    const inUSD_viaCNY = inCNY * newRates['USD'];

    expect(inUSD_viaCNY).toBeCloseTo(inUSD_direct, 6);
  });

  it('handles three non-settlement currencies', () => {
    const rates = { EUR: 0.92, GBP: 0.79, JPY: 157 };
    const result = recalculateExchangeRates(rates, 'USD', 'EUR');

    expect(result['GBP']).toBeCloseTo(0.79 / 0.92, 6);
    expect(result['JPY']).toBeCloseTo(157 / 0.92, 6);
    expect(result['USD']).toBeCloseTo(1 / 0.92, 6);
    expect(result['EUR']).toBeUndefined();
  });

  it('skips zero or negative rates in old rates', () => {
    const rates = { EUR: 0.9, TRY: 0, GBP: -1 };
    const result = recalculateExchangeRates(rates, 'USD', 'EUR');
    expect(result['USD']).toBeCloseTo(1 / 0.9, 6);
    expect(result['TRY']).toBeUndefined();
    expect(result['GBP']).toBeUndefined();
  });

  it('returns old rates when pivot rate is zero', () => {
    const rates = { EUR: 0 };
    expect(recalculateExchangeRates(rates, 'USD', 'EUR')).toBe(rates);
  });

  it('round-trips back to original rates', () => {
    const original = { CNY: 7.25, TRY: 32.5 };
    const switched = recalculateExchangeRates(original, 'USD', 'CNY');
    const restored = recalculateExchangeRates(switched, 'CNY', 'USD');

    expect(restored['CNY']).toBeCloseTo(7.25, 6);
    expect(restored['TRY']).toBeCloseTo(32.5, 6);
    expect(restored['USD']).toBeUndefined();
  });
});

describe('computeSettlementTransactions', () => {
  function applyTransactions(
    balances: UnifiedBalance[],
    transactions: ReturnType<typeof computeSettlementTransactions>
  ): Map<string, number> {
    const nets = new Map(balances.map(b => [b.id, b.balance]));
    for (const tx of transactions) {
      nets.set(tx.from, (nets.get(tx.from) ?? 0) + tx.amount);
      nets.set(tx.to, (nets.get(tx.to) ?? 0) - tx.amount);
    }
    return nets;
  }

  it('creates single transaction for exact opposite balances', () => {
    const balances: UnifiedBalance[] = [
      { id: 'p-1', name: 'Alice', balance: 50 },
      { id: 'p-2', name: 'Bob', balance: -50 }
    ];
    const txs = computeSettlementTransactions(balances);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ from: 'p-2', to: 'p-1', amount: 50 });
  });

  it('finds exact matches among three people', () => {
    const balances: UnifiedBalance[] = [
      { id: 'p-1', name: 'A', balance: 30 },
      { id: 'p-2', name: 'B', balance: -30 },
      { id: 'p-3', name: 'C', balance: 20 }
    ];
    const txs = computeSettlementTransactions(balances);
    expect(txs.some(t => t.amount === 30)).toBe(true);
  });

  it('returns empty when everyone is settled', () => {
    const balances: UnifiedBalance[] = [
      { id: 'p-1', name: 'A', balance: 0.004 },
      { id: 'p-2', name: 'B', balance: -0.003 }
    ];
    expect(computeSettlementTransactions(balances)).toEqual([]);
  });

  it('handles one creditor and many debtors', () => {
    const balances: UnifiedBalance[] = [
      { id: 'p-1', name: 'Creditor', balance: 90 },
      { id: 'p-2', name: 'D1', balance: -50 },
      { id: 'p-3', name: 'D2', balance: -40 }
    ];
    const txs = computeSettlementTransactions(balances);
    const totalOut = txs.reduce((s, t) => s + t.amount, 0);
    expect(totalOut).toBe(90);
  });

  it('conserves money: total outflows equal total inflows', () => {
    const balances: UnifiedBalance[] = [
      { id: 'p-1', name: 'A', balance: 45.5 },
      { id: 'p-2', name: 'B', balance: 12.3 },
      { id: 'p-3', name: 'C', balance: -30 },
      { id: 'p-4', name: 'D', balance: -20 },
      { id: 'p-5', name: 'E', balance: -7.8 }
    ];
    const txs = computeSettlementTransactions(balances);
    const total = txs.reduce((s, t) => s + t.amount, 0);
    const creditorTotal = balances.filter(b => b.balance > 0.005).reduce((s, b) => s + b.balance, 0);
    expect(Math.round(total * 100) / 100).toBe(Math.round(creditorTotal * 100) / 100);
  });

  it('rounds transaction amounts to 2 decimal places', () => {
    const balances: UnifiedBalance[] = [
      { id: 'p-1', name: 'A', balance: 33.33 },
      { id: 'p-2', name: 'B', balance: -33.33 }
    ];
    const txs = computeSettlementTransactions(balances);
    expect(txs[0].amount).toBe(33.33);
  });

  it('resolves complex 5-person scenario', () => {
    const balances: UnifiedBalance[] = [
      { id: 'p-1', name: 'A', balance: 100 },
      { id: 'p-2', name: 'B', balance: 25 },
      { id: 'p-3', name: 'C', balance: -60 },
      { id: 'p-4', name: 'D', balance: -40 },
      { id: 'p-5', name: 'E', balance: -25 }
    ];
    const txs = computeSettlementTransactions(balances);
    const nets = applyTransactions(balances, txs);
    for (const [, net] of nets) {
      expect(Math.abs(net)).toBeLessThan(0.01);
    }
  });
});
