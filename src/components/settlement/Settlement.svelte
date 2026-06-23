<script lang="ts">
  import { ArrowRightLeft, ArrowRight, ArrowLeft, CheckCircle, AlertTriangle } from '@lucide/svelte';
  import { appData, updateData, dataVersion, effectiveSettlementCurrency } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { computeBalances, getStatus } from '$lib/engine/balances';
  import { computeUnifiedBalances, computeSettlementTransactions, recalculateExchangeRates } from '$lib/engine/settlement';
  import { validateSettlement } from '$lib/utils/validation';
  import { formatAmount, getCurrencySymbol } from '$lib/utils/format';
  import { t, isRtl } from '$lib/i18n';
  import type { UnifiedBalance, SettlementTransaction } from '$lib/types';
  import EmptyState from '../layout/EmptyState.svelte';

  let step = $state(1);
  let unifiedBalances: UnifiedBalance[] = $state([]);
  let transactions: SettlementTransaction[] = $state([]);
  let calculated = $state(false);

  let settlementCurrency = $derived($effectiveSettlementCurrency);
  let currencies = $derived($appData.currencies);
  let nonSettlementCurrencies = $derived(currencies.filter(c => c.code !== settlementCurrency));
  let onlySingleCurrency = $derived(currencies.length <= 1);

  let lastCalcVersion: number = $state(-1);

  $effect(() => {
    if (calculated && $dataVersion !== lastCalcVersion) {
      calculated = false;
    }
  });

  function selectSettlementCurrency(code: string) {
    updateData(d => {
      const oldSettlement = d.settlementCurrency || d.currencies[0]?.code || '';
      const newRates = recalculateExchangeRates(d.exchangeRates, oldSettlement, code);
      return { ...d, settlementCurrency: code, exchangeRates: newRates };
    });
    calculated = false;
  }

  function updateRate(code: string, value: string) {
    const rate = parseFloat(value);
    updateData(d => {
      const exchangeRates = { ...d.exchangeRates };
      if (rate > 0) {
        exchangeRates[code] = rate;
      } else {
        delete exchangeRates[code];
      }
      return { ...d, exchangeRates };
    });
    calculated = false;
  }

  function calculate() {
    const currency = settlementCurrency;
    if (!currency) {
      showToast($t('settlement.noSettlementCurrency'), 'error');
      return;
    }

    if (!$appData.settlementCurrency) {
      updateData(d => ({ ...d, settlementCurrency: currency }));
    }

    const error = validateSettlement(
      currency,
      $appData.currencies,
      $appData.exchangeRates
    );
    if (error) {
      showToast($t(error.key, error.params), 'error');
      return;
    }

    const balances = computeBalances($appData.expenses);
    unifiedBalances = computeUnifiedBalances(
      balances,
      $appData.participants,
      currency,
      $appData.exchangeRates
    );
    transactions = computeSettlementTransactions(unifiedBalances);
    calculated = true;
    lastCalcVersion = $dataVersion;
    step = 4;
  }

  function getSymbol(code: string): string {
    return getCurrencySymbol(code, currencies);
  }

  let excludedCurrencies = $derived.by(() => {
    if (!settlementCurrency) return [];
    return nonSettlementCurrencies.filter(c => {
      const rate = $appData.exchangeRates[c.code];
      return !rate || rate <= 0;
    });
  });

  function getStatusColor(balance: number): string {
    if (balance > 0.005) return 'text-success-600 dark:text-success-500';
    if (balance < -0.005) return 'text-danger-500';
    return 'text-[var(--text-secondary)]';
  }
</script>

<div class="p-4 md:p-6 space-y-6">
  {#if currencies.length === 0}
    <EmptyState
      icon={ArrowRightLeft}
      title={$t('settlement.noCurrenciesTitle')}
      description={$t('settlement.noCurrenciesDesc')}
    />
  {:else}
    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-1">
      {#each [1, 2, 3, 4] as s}
        <button
          onclick={() => { if (s <= 3 || calculated) step = s; }}
          class="w-8 h-8 rounded-full text-xs font-bold transition-all
            {step === s
              ? 'bg-primary-600 text-white scale-110 shadow-md'
              : s < step || (s === 4 && calculated)
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                : 'bg-[#e2e8f0] dark:bg-[#334155] text-[var(--text-secondary)]'}"
        >
          {s}
        </button>
        {#if s < 4}
          <div class="w-8 h-0.5 rounded {s < step ? 'bg-primary-500' : 'bg-[#cbd5e1] dark:bg-[#334155]'}"></div>
        {/if}
      {/each}
    </div>

    <!-- Step 1: Select settlement currency -->
    {#if step === 1}
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-[var(--text-secondary)]">{$t('settlement.chooseSettlementCurrency')}</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {#each currencies as c (c.code)}
            <button
              onclick={() => { selectSettlementCurrency(c.code); step = onlySingleCurrency ? 3 : 2; }}
              class="p-4 rounded-2xl border text-center transition-all active:scale-95
                {settlementCurrency === c.code
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-primary-300'}"
            >
              <div class="text-xl mb-1">{c.symbol}</div>
              <div class="text-sm font-medium text-[var(--text-primary)]">{c.code}</div>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Step 2: Exchange rates -->
    {#if step === 2}
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-[var(--text-secondary)]">{$t('settlement.setExchangeRates')}</h3>
        {#if onlySingleCurrency}
          <p class="text-sm text-[var(--text-secondary)]">{$t('settlement.onlySingleCurrency')}</p>
        {:else}
          <div class="space-y-3">
            {#each nonSettlementCurrencies as c (c.code)}
              <div class="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl">
                <label for="rate-{c.code}" class="block text-xs text-[var(--text-secondary)] mb-2">
                  {$t('settlement.rateLabel', { settlement: settlementCurrency, currency: c.code })}
                </label>
                <input
                  id="rate-{c.code}"
                  type="number"
                  step="any"
                  min="0"
                  value={$appData.exchangeRates[c.code] ?? ''}
                  oninput={(e) => updateRate(c.code, (e.target as HTMLInputElement).value)}
                  placeholder={$t('settlement.ratePlaceholder')}
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
                />
              </div>
            {/each}
          </div>
        {/if}
        <button
          onclick={() => step = 3}
          class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
        >
          {$t('common.next')}
        </button>
      </div>
    {/if}

    <!-- Step 3: Calculate -->
    {#if step === 3}
      <div class="space-y-4 text-center">
        <h3 class="text-sm font-semibold text-[var(--text-secondary)]">{$t('settlement.readyToCalculate')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">
          {$t('settlement.settlementCurrencyIs', { symbol: getSymbol(settlementCurrency), code: settlementCurrency })}
          {#if !onlySingleCurrency}
            <br/>{$t('settlement.exchangeRatesConfigured', { count: nonSettlementCurrencies.length })}
          {/if}
        </p>
        <button
          onclick={calculate}
          class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
        >
          {$t('settlement.calculateSettlement')}
        </button>
      </div>
    {/if}

    <!-- Step 4: Results -->
    {#if step === 4 && calculated}
      <div class="space-y-6">
        {#if excludedCurrencies.length > 0}
          <div class="flex items-start gap-2 p-3 rounded-xl bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800/50">
            <AlertTriangle size={16} class="text-warning-600 dark:text-warning-400 mt-0.5 shrink-0" />
            <p class="text-xs text-warning-700 dark:text-warning-300">
              {$t('settlement.excludedCurrencies', { currencies: excludedCurrencies.map(c => c.code).join(', ') })}
            </p>
          </div>
        {/if}

        <!-- Unified Balances -->
        <div>
          <h3 class="text-sm font-semibold text-[var(--text-secondary)] mb-3">{$t('settlement.unifiedBalances', { currency: settlementCurrency })}</h3>
          <div class="space-y-2">
            {#each unifiedBalances as ub (ub.id)}
              {@const status = getStatus(ub.balance)}
              <div class="flex items-center justify-between p-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl">
                <span class="text-sm font-medium text-[var(--text-primary)]">{ub.name}</span>
                <span class="text-sm font-bold {getStatusColor(ub.balance)}">
                  {ub.balance < 0 ? '-' : '+'}{getSymbol(settlementCurrency)}{formatAmount(Math.abs(ub.balance))}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Transactions -->
        <div>
          <h3 class="text-sm font-semibold text-[var(--text-secondary)] mb-3">{$t('settlement.settlementTransactions')}</h3>
          {#if transactions.length === 0}
            <div class="flex flex-col items-center py-8 text-center">
              <CheckCircle size={40} class="text-success-500 mb-3" />
              <p class="text-sm font-medium text-[var(--text-primary)]">{$t('settlement.allSettled')}</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each transactions as tx, i (i)}
                <div class="flex items-center gap-3 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl hover:shadow-md transition-all duration-200">
                  <div class="flex-1 text-end">
                    <span class="text-sm font-medium text-danger-500">{tx.fromName}</span>
                  </div>
                  <div class="flex flex-col items-center gap-0.5">
                    {#if $isRtl}<ArrowLeft size={16} class="text-primary-500" />{:else}<ArrowRight size={16} class="text-primary-500" />{/if}
                    <span class="text-xs font-bold text-primary-600 dark:text-primary-400">
                      {getSymbol(settlementCurrency)}{formatAmount(tx.amount)}
                    </span>
                  </div>
                  <div class="flex-1">
                    <span class="text-sm font-medium text-success-600 dark:text-success-500">{tx.toName}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>
