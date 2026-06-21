import { describe, it, expect } from 'vitest';
import { computeBalances, getStatus } from './balances';
import { makeExpense, makeBeneficiary } from '../../test/factories';

describe('computeBalances', () => {
  it('returns empty object for empty expenses', () => {
    expect(computeBalances([])).toEqual({});
  });

  it('computes equal split between 2 people', () => {
    const expense = makeExpense({
      amount: 100,
      paidBy: 'p-1',
      currencyCode: 'USD',
      beneficiaries: [makeBeneficiary('p-1'), makeBeneficiary('p-2')]
    });
    const balances = computeBalances([expense]);
    expect(balances.USD['p-1'].paid).toBe(100);
    expect(balances.USD['p-1'].owed).toBe(50);
    expect(balances.USD['p-1'].net).toBe(50);
    expect(balances.USD['p-2'].paid).toBe(0);
    expect(balances.USD['p-2'].owed).toBe(50);
    expect(balances.USD['p-2'].net).toBe(-50);
  });

  it('computes custom split', () => {
    const expense = makeExpense({
      amount: 100,
      paidBy: 'p-1',
      splitType: 'custom',
      beneficiaries: [
        makeBeneficiary('p-1', { customAmount: 70 }),
        makeBeneficiary('p-2', { customAmount: 30 })
      ]
    });
    const balances = computeBalances([expense]);
    expect(balances.USD['p-1'].owed).toBe(70);
    expect(balances.USD['p-2'].owed).toBe(30);
  });

  it('accumulates multiple expenses in same currency', () => {
    const e1 = makeExpense({ amount: 100, paidBy: 'p-1', beneficiaries: [makeBeneficiary('p-1'), makeBeneficiary('p-2')] });
    const e2 = makeExpense({ amount: 60, paidBy: 'p-2', beneficiaries: [makeBeneficiary('p-1'), makeBeneficiary('p-2')] });
    const balances = computeBalances([e1, e2]);
    expect(balances.USD['p-1'].paid).toBe(100);
    expect(balances.USD['p-2'].paid).toBe(60);
    expect(balances.USD['p-1'].owed).toBe(80);
    expect(balances.USD['p-2'].owed).toBe(80);
  });

  it('tracks multiple currencies independently', () => {
    const usd = makeExpense({ amount: 100, currencyCode: 'USD', paidBy: 'p-1', beneficiaries: [makeBeneficiary('p-1')] });
    const eur = makeExpense({ amount: 50, currencyCode: 'EUR', paidBy: 'p-2', beneficiaries: [makeBeneficiary('p-2')] });
    const balances = computeBalances([usd, eur]);
    expect(balances.USD).toBeDefined();
    expect(balances.EUR).toBeDefined();
    expect(balances.USD['p-1'].net).toBe(0);
    expect(balances.EUR['p-2'].net).toBe(0);
  });

  it('handles person who only pays', () => {
    const expense = makeExpense({
      amount: 100,
      paidBy: 'p-1',
      beneficiaries: [makeBeneficiary('p-2')]
    });
    const balances = computeBalances([expense]);
    expect(balances.USD['p-1'].paid).toBe(100);
    expect(balances.USD['p-1'].owed).toBe(0);
    expect(balances.USD['p-1'].net).toBe(100);
  });

  it('handles person who only owes', () => {
    const expense = makeExpense({
      amount: 100,
      paidBy: 'p-1',
      beneficiaries: [makeBeneficiary('p-2')]
    });
    const balances = computeBalances([expense]);
    expect(balances.USD['p-2'].paid).toBe(0);
    expect(balances.USD['p-2'].owed).toBe(100);
    expect(balances.USD['p-2'].net).toBe(-100);
  });

  it('converges to zero net when balanced', () => {
    const e1 = makeExpense({ amount: 100, paidBy: 'p-1', beneficiaries: [makeBeneficiary('p-1'), makeBeneficiary('p-2')] });
    const e2 = makeExpense({ amount: 100, paidBy: 'p-2', beneficiaries: [makeBeneficiary('p-1'), makeBeneficiary('p-2')] });
    const balances = computeBalances([e1, e2]);
    expect(balances.USD['p-1'].net).toBe(0);
    expect(balances.USD['p-2'].net).toBe(0);
  });

  it('rounds net to 2 decimal places', () => {
    const expense = makeExpense({
      amount: 10,
      paidBy: 'p-1',
      beneficiaries: [
        makeBeneficiary('p-1'),
        makeBeneficiary('p-2'),
        makeBeneficiary('p-3')
      ]
    });
    const balances = computeBalances([expense]);
    const net = balances.USD['p-1'].net;
    expect(net).toBe(Math.round(net * 100) / 100);
  });
});

describe('getStatus', () => {
  it.each([
    [10, 'creditor'],
    [0.006, 'creditor'],
    [0, 'settled'],
    [0.004, 'settled'],
    [-0.004, 'settled'],
    [0.005, 'settled'],
    [-0.005, 'settled'],
    [-0.006, 'debtor'],
    [-10, 'debtor']
  ])('getStatus(%f) returns %s', (net, expected) => {
    expect(getStatus(net)).toBe(expected);
  });
});
