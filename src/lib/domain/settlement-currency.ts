/**
 * Safe settlement-currency changes and settlement readiness.
 *
 * INVARIANT: `data.exchangeRates` is always expressed as
 * "units of `code` per 1 unit of `data.settlementCurrency`". A settlement
 * currency may therefore never be persisted next to rates that still use a
 * different currency as their base.
 *
 * The previous `recalculateExchangeRates` signalled failure by returning the
 * old rates unchanged, which callers could not distinguish from success — so
 * they persisted the new currency with stale-base rates.
 */
import type { AppData } from '../types';
import { recalculateExchangeRates } from '../engine/settlement';

export type SettlementChangeReason = 'same_currency' | 'invalid_currency' | 'no_pivot_rate';

export interface SettlementChangePlan {
  settlementCurrency: string;
  exchangeRates: Record<string, number>;
  /** Currencies whose rate could not be carried over and must be re-entered. */
  clearedRates: string[];
}

export type SettlementChangeResult =
  | { ok: true; plan: SettlementChangePlan }
  | { ok: false; reason: SettlementChangeReason; clearableRates: string[] };

function currentSettlement(data: Pick<AppData, 'settlementCurrency' | 'currencies'>): string {
  return data.settlementCurrency || data.currencies[0]?.code || '';
}

/**
 * Plans a settlement-currency switch without mutating anything.
 *
 * Succeeds only when every retained rate can be re-based onto the new
 * settlement currency via a valid pivot. When the pivot is missing the caller
 * must decide explicitly: refuse, or clear the incompatible rates
 * (`planSettlementCurrencyChangeClearingRates`).
 */
export function planSettlementCurrencyChange(
  data: Pick<AppData, 'settlementCurrency' | 'currencies' | 'exchangeRates'>,
  newSettlement: string
): SettlementChangeResult {
  const oldSettlement = currentSettlement(data);
  const clearableRates = Object.keys(data.exchangeRates).filter(c => c !== newSettlement);

  if (!newSettlement) {
    return { ok: false, reason: 'invalid_currency', clearableRates };
  }
  if (!data.currencies.some(c => c.code === newSettlement)) {
    return { ok: false, reason: 'invalid_currency', clearableRates };
  }
  if (oldSettlement === newSettlement) {
    return { ok: false, reason: 'same_currency', clearableRates };
  }

  // No prior base: nothing to re-base, adopt the currency as-is.
  if (!oldSettlement) {
    const rates = { ...data.exchangeRates };
    delete rates[newSettlement];
    return {
      ok: true,
      plan: { settlementCurrency: newSettlement, exchangeRates: rates, clearedRates: [] }
    };
  }

  // No rates at all: switching bases is trivially safe.
  if (Object.keys(data.exchangeRates).length === 0) {
    return {
      ok: true,
      plan: { settlementCurrency: newSettlement, exchangeRates: {}, clearedRates: [] }
    };
  }

  const recalculated = recalculateExchangeRates(data.exchangeRates, oldSettlement, newSettlement);
  if (!recalculated.ok) {
    return { ok: false, reason: 'no_pivot_rate', clearableRates };
  }

  return {
    ok: true,
    plan: {
      settlementCurrency: newSettlement,
      exchangeRates: recalculated.rates,
      clearedRates: []
    }
  };
}

/**
 * Fallback for a missing pivot: adopt the new settlement currency and drop
 * every rate that cannot be re-based, so the user re-enters them. Never keeps
 * a rate whose base would silently change meaning.
 */
export function planSettlementCurrencyChangeClearingRates(
  data: Pick<AppData, 'settlementCurrency' | 'currencies' | 'exchangeRates'>,
  newSettlement: string
): SettlementChangePlan {
  const cleared = Object.keys(data.exchangeRates).filter(c => c !== newSettlement);
  return {
    settlementCurrency: newSettlement,
    exchangeRates: {},
    clearedRates: cleared
  };
}

/** Applies a plan to app data. Pure. */
export function applySettlementChangePlan<T extends AppData>(data: T, plan: SettlementChangePlan): T {
  return {
    ...data,
    settlementCurrency: plan.settlementCurrency,
    exchangeRates: plan.exchangeRates
  };
}

/**
 * Removing a currency must preserve the same invariant: if the currency being
 * removed is the settlement base, the surviving rates are only kept when they
 * can be re-based onto the replacement.
 */
export function planCurrencyRemoval(
  data: Pick<AppData, 'settlementCurrency' | 'currencies' | 'exchangeRates'>,
  removedCode: string
): SettlementChangePlan & { currencies: { code: string; symbol: string }[] } {
  const currencies = data.currencies.filter(c => c.code !== removedCode);
  const oldSettlement = currentSettlement(data);

  const ratesWithoutRemoved = { ...data.exchangeRates };
  delete ratesWithoutRemoved[removedCode];

  if (oldSettlement !== removedCode) {
    return {
      settlementCurrency: data.settlementCurrency === removedCode ? '' : data.settlementCurrency,
      exchangeRates: ratesWithoutRemoved,
      clearedRates: [],
      currencies
    };
  }

  const replacement = currencies[0]?.code ?? '';
  if (!replacement) {
    return {
      settlementCurrency: '',
      exchangeRates: {},
      clearedRates: Object.keys(ratesWithoutRemoved),
      currencies
    };
  }

  const recalculated = recalculateExchangeRates(ratesWithoutRemoved, oldSettlement, replacement);
  if (!recalculated.ok) {
    return {
      settlementCurrency: replacement,
      exchangeRates: {},
      clearedRates: Object.keys(ratesWithoutRemoved),
      currencies
    };
  }

  const rates = { ...recalculated.rates };
  delete rates[removedCode];
  delete rates[replacement];
  return {
    settlementCurrency: replacement,
    exchangeRates: rates,
    clearedRates: [],
    currencies
  };
}

export interface SettlementReadiness {
  settlementCurrency: string;
  /** True only when every currency in use can be converted. */
  ready: boolean;
  /** Configured currencies lacking a usable rate. */
  missingRateCurrencies: string[];
  /**
   * Currencies that actually carry expenses but cannot be converted. These are
   * the ones whose omission changes the numbers.
   */
  excludedCurrenciesInUse: string[];
  hasSettlementCurrency: boolean;
}

/**
 * Shared readiness check used by both the Settlement screen and the dashboard,
 * so the two can no longer disagree about whether a settlement is complete.
 */
export function getSettlementReadiness(
  data: Pick<AppData, 'currencies' | 'exchangeRates' | 'expenses' | 'settlementCurrency'>,
  settlementCurrencyOverride?: string
): SettlementReadiness {
  const settlementCurrency = settlementCurrencyOverride ?? currentSettlement(data);

  if (!settlementCurrency) {
    return {
      settlementCurrency: '',
      ready: false,
      missingRateCurrencies: [],
      excludedCurrenciesInUse: [],
      hasSettlementCurrency: false
    };
  }

  const missingRateCurrencies = data.currencies
    .filter(c => c.code !== settlementCurrency)
    .filter(c => {
      const rate = data.exchangeRates[c.code];
      return !rate || rate <= 0 || !Number.isFinite(rate);
    })
    .map(c => c.code);

  const missingSet = new Set(missingRateCurrencies);
  const currenciesInUse = new Set(data.expenses.map(e => e.currencyCode));
  const excludedCurrenciesInUse = [...currenciesInUse].filter(code => missingSet.has(code)).sort();

  return {
    settlementCurrency,
    ready: excludedCurrenciesInUse.length === 0,
    missingRateCurrencies,
    excludedCurrenciesInUse,
    hasSettlementCurrency: true
  };
}
