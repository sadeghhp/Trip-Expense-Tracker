import { describe, it, expect } from 'vitest';
import { computeUnifiedBalances, computeSettlementTransactions } from './settlement';
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
