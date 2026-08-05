import { describe, it, expect } from 'vitest';
import {
  planSettlementCurrencyChange,
  planSettlementCurrencyChangeClearingRates,
  applySettlementChangePlan,
  planCurrencyRemoval,
  getSettlementReadiness
} from './settlement-currency';
import { computeUnifiedBalances } from '../engine/settlement';
import { computeBalances } from '../engine/balances';
import { makeAppData, makeExpense, makeCurrency } from '../../test/factories';
import type { AppData } from '../types';

function data(overrides: Partial<AppData> = {}): AppData {
  return makeAppData({
    currencies: [
      makeCurrency({ code: 'USD', symbol: '$' }),
      makeCurrency({ code: 'EUR', symbol: '€' }),
      makeCurrency({ code: 'IRR', symbol: '﷼' })
    ],
    settlementCurrency: 'USD',
    exchangeRates: { EUR: 0.9 },
    ...overrides
  });
}

describe('planSettlementCurrencyChange', () => {
  it('re-bases every rate through a valid pivot', () => {
    const plan = planSettlementCurrencyChange(
      data({ exchangeRates: { EUR: 0.9, IRR: 42000 } }),
      'EUR'
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // 1 EUR buys 42000/0.9 IRR, and 1/0.9 USD.
    expect(plan.plan.exchangeRates['IRR']).toBeCloseTo(42000 / 0.9, 4);
    expect(plan.plan.exchangeRates['USD']).toBeCloseTo(1 / 0.9, 6);
    expect(plan.plan.exchangeRates['EUR']).toBeUndefined();
    expect(plan.plan.settlementCurrency).toBe('EUR');
  });

  it('refuses the switch when the pivot rate is missing', () => {
    // IRR has no rate, so no conversion factor exists.
    const plan = planSettlementCurrencyChange(data(), 'IRR');
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe('no_pivot_rate');
    expect(plan.clearableRates).toContain('EUR');
  });

  it('never yields a currency paired with stale-base rates', () => {
    // The regression: the old API returned the old rates on failure, and
    // callers persisted them next to the new settlement currency.
    const before = data();
    const plan = planSettlementCurrencyChange(before, 'IRR');
    expect(plan.ok).toBe(false);

    const forced = planSettlementCurrencyChangeClearingRates(before, 'IRR');
    const after = applySettlementChangePlan(before, forced);
    expect(after.settlementCurrency).toBe('IRR');
    // EUR's old rate meant "per 1 USD"; it must not survive as "per 1 IRR".
    expect(after.exchangeRates['EUR']).toBeUndefined();
    expect(forced.clearedRates).toEqual(['EUR']);
  });

  it('rejects a currency that is not configured', () => {
    const plan = planSettlementCurrencyChange(data(), 'GBP');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toBe('invalid_currency');
  });

  it('reports a no-op when the currency is unchanged', () => {
    const plan = planSettlementCurrencyChange(data(), 'USD');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toBe('same_currency');
  });

  it('adopts a currency freely when there are no rates yet', () => {
    const plan = planSettlementCurrencyChange(data({ exchangeRates: {} }), 'IRR');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.plan.exchangeRates).toEqual({});
  });

  it('preserves conversion equivalence across the switch', () => {
    const before = data({ exchangeRates: { EUR: 0.9, IRR: 42000 } });
    const plan = planSettlementCurrencyChange(before, 'EUR');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const after = applySettlementChangePlan(before, plan.plan);

    // 100 IRR is worth the same in USD before and after the base change.
    const usdBefore = 100 / before.exchangeRates['IRR'];
    const inEur = 100 / after.exchangeRates['IRR'];
    const usdAfter = inEur * after.exchangeRates['USD'];
    expect(usdAfter).toBeCloseTo(usdBefore, 8);
  });
});

describe('planCurrencyRemoval', () => {
  it('re-bases surviving rates when the settlement currency is removed', () => {
    const before = data({ exchangeRates: { EUR: 0.9, IRR: 42000 } });
    const plan = planCurrencyRemoval(before, 'USD');
    expect(plan.settlementCurrency).toBe('EUR');
    expect(plan.exchangeRates['IRR']).toBeCloseTo(42000 / 0.9, 4);
    expect(plan.exchangeRates['USD']).toBeUndefined();
    expect(plan.clearedRates).toEqual([]);
  });

  it('clears rates that cannot be re-based rather than keeping a wrong base', () => {
    // Removing USD promotes EUR, but there is no EUR pivot to convert IRR.
    const before = makeAppData({
      currencies: [makeCurrency({ code: 'USD' }), makeCurrency({ code: 'EUR', symbol: '€' })],
      settlementCurrency: 'USD',
      exchangeRates: { IRR: 42000 }
    });
    const plan = planCurrencyRemoval(before, 'USD');
    expect(plan.settlementCurrency).toBe('EUR');
    expect(plan.exchangeRates).toEqual({});
    expect(plan.clearedRates).toContain('IRR');
  });

  it('leaves settlement alone when a non-settlement currency is removed', () => {
    const plan = planCurrencyRemoval(data({ exchangeRates: { EUR: 0.9 } }), 'EUR');
    expect(plan.settlementCurrency).toBe('USD');
    expect(plan.exchangeRates['EUR']).toBeUndefined();
  });

  it('handles removing the last currency', () => {
    const before = makeAppData({
      currencies: [makeCurrency({ code: 'USD' })],
      settlementCurrency: 'USD',
      exchangeRates: {}
    });
    const plan = planCurrencyRemoval(before, 'USD');
    expect(plan.settlementCurrency).toBe('');
    expect(plan.exchangeRates).toEqual({});
  });
});

describe('getSettlementReadiness', () => {
  it('reports not-ready when all expenses are in an unrated currency', () => {
    const d = data({
      exchangeRates: {},
      expenses: [makeExpense({ currencyCode: 'EUR', amount: 100 })]
    });
    const readiness = getSettlementReadiness(d);
    expect(readiness.ready).toBe(false);
    expect(readiness.excludedCurrenciesInUse).toEqual(['EUR']);
  });

  it('reports not-ready when only some currencies are rated', () => {
    const d = data({
      exchangeRates: { EUR: 0.9 },
      expenses: [
        makeExpense({ currencyCode: 'EUR', amount: 100 }),
        makeExpense({ currencyCode: 'IRR', amount: 500000 })
      ]
    });
    const readiness = getSettlementReadiness(d);
    expect(readiness.ready).toBe(false);
    expect(readiness.excludedCurrenciesInUse).toEqual(['IRR']);
  });

  it('is ready when every currency in use converts', () => {
    const d = data({
      exchangeRates: { EUR: 0.9, IRR: 42000 },
      expenses: [makeExpense({ currencyCode: 'EUR', amount: 100 })]
    });
    expect(getSettlementReadiness(d).ready).toBe(true);
  });

  it('ignores unrated currencies that carry no expenses', () => {
    // IRR has no rate but nothing is booked in it, so nothing is excluded.
    const d = data({
      exchangeRates: { EUR: 0.9 },
      expenses: [makeExpense({ currencyCode: 'USD', amount: 10 })]
    });
    const readiness = getSettlementReadiness(d);
    expect(readiness.ready).toBe(true);
    expect(readiness.missingRateCurrencies).toContain('IRR');
  });

  it('is not ready without a settlement currency', () => {
    const d = data({ settlementCurrency: '', currencies: [] });
    const readiness = getSettlementReadiness(d);
    expect(readiness.ready).toBe(false);
    expect(readiness.hasSettlementCurrency).toBe(false);
  });

  it('rejects non-finite rates', () => {
    const d = data({
      exchangeRates: { EUR: Number.POSITIVE_INFINITY },
      expenses: [makeExpense({ currencyCode: 'EUR', amount: 10 })]
    });
    expect(getSettlementReadiness(d).ready).toBe(false);
  });

  it('flags exactly the currencies the engine silently drops', () => {
    // The dashboard reported "everyone is settled up" precisely here: the
    // engine skips unrated currencies, so every unified balance came out 0.
    const participants = [
      { id: 'p-1', name: 'Alice' },
      { id: 'p-2', name: 'Bob' }
    ];
    const expenses = [
      makeExpense({
        currencyCode: 'EUR',
        amount: 100,
        paidBy: 'p-1',
        beneficiaries: [
          { participantId: 'p-1', customAmount: null, customPercentage: null },
          { participantId: 'p-2', customAmount: null, customPercentage: null }
        ]
      })
    ];
    const d = data({ participants, expenses, exchangeRates: {} });

    const unified = computeUnifiedBalances(
      computeBalances(expenses),
      participants,
      'USD',
      {}
    );
    expect(unified.every(u => Math.abs(u.balance) <= 0.005)).toBe(true);

    // ...so readiness must be false, which is what suppresses the claim.
    expect(getSettlementReadiness(d).ready).toBe(false);
  });
});
