<script lang="ts">
  import { fly, slide } from 'svelte/transition';
  import {
    Plus, Users, Coins, BarChart3, ArrowRightLeft, Download,
    TrendingUp, Calendar, Receipt, Crown, Sparkles, ChevronLeft, ChevronRight,
    ChevronDown, AlertTriangle, Camera
  } from '@lucide/svelte';
  import { appData, activeTrip, exitTrip, updateData, effectiveSettlementCurrency as effectiveSettlementCurrencyStore } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { settings } from '$lib/stores/settings';
  import { t, isRtl } from '$lib/i18n';
  import { computeBalances } from '$lib/engine/balances';
  import { computeUnifiedBalances, computeSettlementTransactions } from '$lib/engine/settlement';
  import { formatDateDisplay, getTodayISO } from '$lib/engine/calendar';
  import { formatAmount, getParticipantName, getCurrencySymbol } from '$lib/utils/format';
  import type { TabId } from '$lib/types';
  import ExpenseForm from '../expenses/ExpenseForm.svelte';
  import ReceiptScanner from '../receipt/ReceiptScanner.svelte';
  import SetupWizard from './SetupWizard.svelte';

  interface Props {
    onNavigate: (tab: TabId) => void;
  }

  let { onNavigate }: Props = $props();

  let showExpenseForm = $state(false);
  let showReceiptScanner = $state(false);
  let showCurrencyPicker = $state(false);

  let effectiveSettlementCurrency = $derived($effectiveSettlementCurrencyStore);

  let settlementCurrencySymbol = $derived(
    getCurrencySymbol(effectiveSettlementCurrency, $appData.currencies)
  );

  interface SpendingSummary {
    convertedTotal: number;
    unconverted: { code: string; symbol: string; total: number }[];
    hasAllRates: boolean;
  }

  let spendingSummary = $derived.by((): SpendingSummary => {
    const { expenses, exchangeRates, currencies } = $appData;
    if (!expenses.length || !effectiveSettlementCurrency) {
      return { convertedTotal: 0, unconverted: [], hasAllRates: true };
    }

    let convertedTotal = 0;
    const unconvertedMap: Record<string, number> = {};

    for (const exp of expenses) {
      if (exp.currencyCode === effectiveSettlementCurrency) {
        convertedTotal += exp.amount;
      } else {
        const rate = exchangeRates[exp.currencyCode];
        if (rate) {
          convertedTotal += exp.amount / rate;
        } else {
          unconvertedMap[exp.currencyCode] = (unconvertedMap[exp.currencyCode] || 0) + exp.amount;
        }
      }
    }

    const unconverted = Object.entries(unconvertedMap).map(([code, total]) => ({
      code,
      symbol: getCurrencySymbol(code, currencies),
      total: Math.round(total * 100) / 100
    }));

    return {
      convertedTotal: Math.round(convertedTotal * 100) / 100,
      unconverted,
      hasAllRates: unconverted.length === 0
    };
  });

  let totalSpending = $derived(spendingSummary.convertedTotal);

  let todaySummary = $derived.by((): SpendingSummary => {
    const { exchangeRates, currencies } = $appData;
    if (!todayExpenses.length || !effectiveSettlementCurrency) {
      return { convertedTotal: 0, unconverted: [], hasAllRates: true };
    }

    let convertedTotal = 0;
    const unconvertedMap: Record<string, number> = {};

    for (const exp of todayExpenses) {
      if (exp.currencyCode === effectiveSettlementCurrency) {
        convertedTotal += exp.amount;
      } else {
        const rate = exchangeRates[exp.currencyCode];
        if (rate) {
          convertedTotal += exp.amount / rate;
        } else {
          unconvertedMap[exp.currencyCode] = (unconvertedMap[exp.currencyCode] || 0) + exp.amount;
        }
      }
    }

    const unconverted = Object.entries(unconvertedMap).map(([code, total]) => ({
      code,
      symbol: getCurrencySymbol(code, currencies),
      total: Math.round(total * 100) / 100
    }));

    return {
      convertedTotal: Math.round(convertedTotal * 100) / 100,
      unconverted,
      hasAllRates: unconverted.length === 0
    };
  });

  let todayTotal = $derived(todaySummary.convertedTotal);

  let balances = $derived(computeBalances($appData.expenses));

  let unifiedBalances = $derived(
    computeUnifiedBalances(balances, $appData.participants, effectiveSettlementCurrency, $appData.exchangeRates)
  );

  let settlements = $derived(computeSettlementTransactions(unifiedBalances));

  let creditors = $derived(unifiedBalances.filter(b => b.balance > 0.005));
  let debtors = $derived(unifiedBalances.filter(b => b.balance < -0.005));
  let settledCount = $derived(unifiedBalances.filter(b => Math.abs(b.balance) <= 0.005).length);

  let recentExpenses = $derived(
    [...$appData.expenses]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 5)
  );

  let todayExpenses = $derived.by(() => {
    const today = getTodayISO();
    return $appData.expenses.filter(e => e.date === today);
  });

  let averageDailySpending = $derived.by(() => {
    const { expenses } = $appData;
    if (!expenses.length) return 0;
    const dates = new Set(expenses.map(e => e.date));
    if (dates.size === 0) return 0;
    return Math.round((totalSpending / dates.size) * 100) / 100;
  });

  let biggestSpender = $derived.by(() => {
    const { expenses, participants, exchangeRates } = $appData;
    if (!expenses.length || !participants.length) return null;
    const spending: Record<string, number> = {};
    for (const exp of expenses) {
      if (exp.currencyCode === effectiveSettlementCurrency) {
        spending[exp.paidBy] = (spending[exp.paidBy] || 0) + exp.amount;
      } else {
        const rate = exchangeRates[exp.currencyCode];
        if (rate) {
          spending[exp.paidBy] = (spending[exp.paidBy] || 0) + exp.amount / rate;
        }
      }
    }
    const maxId = Object.entries(spending).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!maxId) return null;
    return getParticipantName(maxId, participants);
  });

  let tripDuration = $derived.by(() => {
    const trip = $activeTrip;
    if (!trip) return '';
    const created = new Date(trip.createdAt);
    const now = new Date();
    const days = Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 1) return $t('home.day');
    return $t('home.days', { count: days });
  });

  let settlementProgress = $derived.by(() => {
    const total = $appData.participants.length;
    if (total === 0) return 100;
    return Math.round((settledCount / total) * 100);
  });

  function selectCurrency(code: string) {
    updateData(d => ({ ...d, settlementCurrency: code }));
    showCurrencyPicker = false;
  }

  function handleExpenseSaved() {
    showExpenseForm = false;
  }

  function handleClickOutsidePicker(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-currency-picker]')) {
      showCurrencyPicker = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutsidePicker} />

<div class="px-4 md:px-6 py-4 md:py-6 space-y-5">
  <!-- Mini Header with back navigation -->
  <div class="flex items-center gap-3 -mt-1 mb-1">
    <button
      onclick={() => exitTrip()}
      class="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
    >
      {#if $isRtl}<ChevronRight size={20} class="text-[var(--text-secondary)]" />{:else}<ChevronLeft size={20} class="text-[var(--text-secondary)]" />{/if}
    </button>
    <div class="flex-1 min-w-0">
      <p class="text-xs text-[var(--text-secondary)] font-medium">{$t('home.tripDashboard')}</p>
    </div>
  </div>

  <!-- Hero Summary -->
  <section
    class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 p-5 md:p-7 text-white shadow-lg"
    in:fly={{ y: 20, duration: 300, delay: 50 }}
  >
    <div class="absolute top-0 end-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
    <div class="absolute bottom-0 start-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4"></div>

    <div class="relative z-10">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h1 class="text-xl md:text-2xl font-bold tracking-tight">{$activeTrip?.name ?? $t('home.tripFallback')}</h1>
          <p class="text-white/70 text-sm mt-0.5 flex items-center gap-1.5">
            <Calendar size={13} />
            <span>{tripDuration}</span>
            <span class="mx-1">·</span>
            <Users size={13} />
            <span>{$appData.participants.length} {$appData.participants.length === 1 ? $t('common.person') : $t('common.people')}</span>
          </p>
        </div>

        <!-- Currency Selector -->
        {#if effectiveSettlementCurrency && $appData.currencies.length > 0}
          <div class="relative" data-currency-picker>
            <button
              onclick={(e) => { e.stopPropagation(); showCurrencyPicker = !showCurrencyPicker; }}
              class="text-xs bg-white/15 backdrop-blur-sm px-2.5 py-1.5 rounded-full font-medium flex items-center gap-1 hover:bg-white/25 transition-colors cursor-pointer"
            >
              {effectiveSettlementCurrency}
              <ChevronDown size={12} class="opacity-70 transition-transform {showCurrencyPicker ? 'rotate-180' : ''}" />
            </button>

            {#if showCurrencyPicker}
              <div
                class="absolute top-full end-0 mt-2 min-w-[140px] bg-white dark:bg-surface-800 rounded-xl shadow-xl border border-surface-200 dark:border-surface-700 overflow-hidden z-50"
                transition:slide={{ duration: 150 }}
              >
                {#each $appData.currencies as currency (currency.code)}
                  <button
                    onclick={(e) => { e.stopPropagation(); selectCurrency(currency.code); }}
                    class="w-full px-3.5 py-2.5 text-start text-sm flex items-center gap-2 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors
                      {currency.code === effectiveSettlementCurrency ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold' : 'text-surface-700 dark:text-surface-200'}"
                  >
                    <span class="w-5 text-center font-medium opacity-70">{currency.symbol}</span>
                    <span>{currency.code}</span>
                    {#if currency.code === effectiveSettlementCurrency}
                      <span class="ms-auto w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="mt-5">
        <p class="text-white/60 text-xs font-medium uppercase tracking-wider">{$t('home.totalSpending')}</p>
        <p class="text-3xl md:text-4xl font-bold tracking-tight mt-1">
          {settlementCurrencySymbol}{formatAmount(totalSpending)}
        </p>

        <!-- Unconverted currencies breakdown -->
        {#if spendingSummary.unconverted.length > 0}
          <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {#each spendingSummary.unconverted as item}
              <span class="text-sm text-white/70 font-medium">
                + {item.symbol}{formatAmount(item.total)}
              </span>
            {/each}
          </div>
          <button
            onclick={() => onNavigate('settlement')}
            class="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-200/90 hover:text-amber-100 font-medium transition-colors"
          >
            <AlertTriangle size={11} />
            <span>{$t('home.setExchangeRates')}</span>
          </button>
        {/if}
      </div>

      <div class="flex gap-4 mt-5 pt-4 border-t border-white/15">
        <div>
          <p class="text-white/60 text-[11px] uppercase tracking-wider">{$t('home.expenses')}</p>
          <p class="text-lg font-semibold">{$appData.expenses.length}</p>
        </div>
        <div>
          <p class="text-white/60 text-[11px] uppercase tracking-wider">{$t('home.today')}</p>
          <p class="text-lg font-semibold">
            {settlementCurrencySymbol}{formatAmount(todayTotal)}
            {#if todaySummary.unconverted.length > 0}
              <span class="text-xs text-white/50 font-normal ms-0.5">+{todaySummary.unconverted.length}</span>
            {/if}
          </p>
        </div>
        <div>
          <p class="text-white/60 text-[11px] uppercase tracking-wider">{$t('home.avgPerDay')}</p>
          <p class="text-lg font-semibold">{settlementCurrencySymbol}{formatAmount(averageDailySpending)}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Quick Actions -->
  <section in:fly={{ y: 20, duration: 300, delay: 100 }}>
    <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
      <button
        onclick={() => showExpenseForm = true}
        class="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/50 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-all active:scale-95"
      >
        <div class="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center">
          <Plus size={18} class="text-white" />
        </div>
        <span class="text-[11px] font-medium text-primary-700 dark:text-primary-300">{$t('home.expense')}</span>
      </button>

      <button
        onclick={() => showReceiptScanner = true}
        class="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-accent-50 dark:bg-accent-900/20 border border-accent-100 dark:border-accent-800/50 hover:bg-accent-100 dark:hover:bg-accent-900/30 transition-all active:scale-95"
      >
        <div class="w-9 h-9 rounded-xl bg-accent-500 flex items-center justify-center">
          <Camera size={18} class="text-white" />
        </div>
        <span class="text-[11px] font-medium text-accent-700 dark:text-accent-300">{$t('home.scanReceipt')}</span>
      </button>

      <button
        onclick={() => onNavigate('participants')}
        class="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-surface-50 dark:hover:bg-surface-800 transition-all active:scale-95"
      >
        <div class="w-9 h-9 rounded-xl bg-accent-100 dark:bg-accent-500/20 flex items-center justify-center">
          <Users size={18} class="text-accent-600 dark:text-accent-400" />
        </div>
        <span class="text-[11px] font-medium text-[var(--text-secondary)]">{$t('home.people')}</span>
      </button>

      <button
        onclick={() => onNavigate('currencies')}
        class="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-surface-50 dark:hover:bg-surface-800 transition-all active:scale-95"
      >
        <div class="w-9 h-9 rounded-xl bg-success-100 dark:bg-success-500/20 flex items-center justify-center">
          <Coins size={18} class="text-success-600 dark:text-success-500" />
        </div>
        <span class="text-[11px] font-medium text-[var(--text-secondary)]">{$t('home.currency')}</span>
      </button>

      <button
        onclick={() => onNavigate('balances')}
        class="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-surface-50 dark:hover:bg-surface-800 transition-all active:scale-95"
      >
        <div class="w-9 h-9 rounded-xl bg-warning-100 dark:bg-warning-500/20 flex items-center justify-center">
          <BarChart3 size={18} class="text-warning-600 dark:text-warning-500" />
        </div>
        <span class="text-[11px] font-medium text-[var(--text-secondary)]">{$t('home.balances')}</span>
      </button>

      <button
        onclick={() => onNavigate('settlement')}
        class="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-surface-50 dark:hover:bg-surface-800 transition-all active:scale-95"
      >
        <div class="w-9 h-9 rounded-xl bg-danger-100 dark:bg-danger-500/20 flex items-center justify-center">
          <ArrowRightLeft size={18} class="text-danger-600 dark:text-danger-500" />
        </div>
        <span class="text-[11px] font-medium text-[var(--text-secondary)]">{$t('home.settle')}</span>
      </button>

      <button
        onclick={() => onNavigate('settings')}
        class="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-surface-50 dark:hover:bg-surface-800 transition-all active:scale-95"
      >
        <div class="w-9 h-9 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
          <Download size={18} class="text-surface-600 dark:text-surface-400" />
        </div>
        <span class="text-[11px] font-medium text-[var(--text-secondary)]">{$t('home.export')}</span>
      </button>
    </div>
  </section>

  <!-- Balance Overview -->
  {#if $appData.participants.length > 0 && $appData.expenses.length > 0}
    <section
      class="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4 md:p-5 shadow-sm"
      in:fly={{ y: 20, duration: 300, delay: 150 }}
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-[var(--text-primary)]">{$t('home.balances')}</h2>
        <button
          onclick={() => onNavigate('balances')}
          class="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline"
        >
          {$t('home.viewAll')}
        </button>
      </div>

      <div class="space-y-2">
        {#each unifiedBalances.filter(b => Math.abs(b.balance) > 0.005).sort((a, b) => b.balance - a.balance) as person}
          <div class="flex items-center gap-3 py-1.5">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              {person.balance > 0
                ? 'bg-success-100 dark:bg-success-500/20 text-success-700 dark:text-success-400'
                : 'bg-danger-100 dark:bg-danger-500/20 text-danger-700 dark:text-danger-400'}">
              {person.name.charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-[var(--text-primary)] truncate">{person.name}</p>
              <p class="text-[11px] text-[var(--text-secondary)]">
                {person.balance > 0 ? $t('home.isOwed') : $t('home.owes')}
              </p>
            </div>
            <span class="text-sm font-semibold tabular-nums
              {person.balance > 0
                ? 'text-success-600 dark:text-success-400'
                : 'text-danger-600 dark:text-danger-400'}">
              {person.balance > 0 ? '+' : ''}{settlementCurrencySymbol}{formatAmount(Math.abs(person.balance))}
            </span>
          </div>
        {/each}

        {#if unifiedBalances.every(b => Math.abs(b.balance) <= 0.005)}
          <p class="text-sm text-center text-success-600 dark:text-success-400 py-3 font-medium">
            {$t('home.everyoneSettled')}
          </p>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Settlement Status -->
  {#if settlements.length > 0}
    <section
      class="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4 md:p-5 shadow-sm"
      in:fly={{ y: 20, duration: 300, delay: 200 }}
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-[var(--text-primary)]">{$t('home.settlement')}</h2>
        <button
          onclick={() => onNavigate('settlement')}
          class="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline"
        >
          {$t('home.details')}
        </button>
      </div>

      <div class="flex items-center gap-4 mb-3">
        <div class="flex-1">
          <div class="h-2 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
            <div
              class="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500"
              style="width: {settlementProgress}%"
            ></div>
          </div>
        </div>
        <span class="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">{settlementProgress}%</span>
      </div>

      <div class="flex gap-4 text-center">
        <div class="flex-1 py-2 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <p class="text-lg font-bold text-[var(--text-primary)]">{settlements.length}</p>
          <p class="text-[11px] text-[var(--text-secondary)]">{$t('home.transfersNeeded')}</p>
        </div>
        <div class="flex-1 py-2 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <p class="text-lg font-bold text-[var(--text-primary)]">{debtors.length}</p>
          <p class="text-[11px] text-[var(--text-secondary)]">{$t('home.oweMoney')}</p>
        </div>
        <div class="flex-1 py-2 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <p class="text-lg font-bold text-[var(--text-primary)]">{creditors.length}</p>
          <p class="text-[11px] text-[var(--text-secondary)]">{$t('home.areOwed')}</p>
        </div>
      </div>
    </section>
  {/if}

  <!-- Recent Expenses -->
  {#if recentExpenses.length > 0}
    <section
      class="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4 md:p-5 shadow-sm"
      in:fly={{ y: 20, duration: 300, delay: 250 }}
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-[var(--text-primary)]">{$t('home.recentActivity')}</h2>
        <button
          onclick={() => onNavigate('expenses')}
          class="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline"
        >
          {$t('home.viewAll')}
        </button>
      </div>

      <div class="space-y-1">
        {#each recentExpenses as expense, i}
          {@const payer = getParticipantName(expense.paidBy, $appData.participants)}
          {@const symbol = getCurrencySymbol(expense.currencyCode, $appData.currencies)}
          <div
            class="flex items-center gap-3 py-2.5 {i < recentExpenses.length - 1 ? 'border-b border-[var(--card-border)]/50' : ''}"
          >
            <div class="w-9 h-9 rounded-xl bg-surface-50 dark:bg-surface-800 flex items-center justify-center shrink-0">
              <Receipt size={16} class="text-[var(--text-secondary)]" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-[var(--text-primary)] truncate">
                {expense.description || $t('home.untitled')}
              </p>
              <p class="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {payer} · {formatDateDisplay(expense.date, $settings.calendar)}
                · {expense.beneficiaries.length} {expense.beneficiaries.length === 1 ? $t('common.person') : $t('common.people')}
              </p>
            </div>
            <span class="text-sm font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
              {symbol}{formatAmount(expense.amount)}
            </span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Trip Insights -->
  {#if $appData.expenses.length >= 3}
    <section
      class="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4 md:p-5 shadow-sm"
      in:fly={{ y: 20, duration: 300, delay: 300 }}
    >
      <div class="flex items-center gap-2 mb-3">
        <Sparkles size={14} class="text-accent-500" />
        <h2 class="text-sm font-semibold text-[var(--text-primary)]">{$t('home.insights')}</h2>
      </div>

      <div class="grid grid-cols-2 gap-3">
        {#if biggestSpender}
          <div class="p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
            <div class="flex items-center gap-1.5 mb-1">
              <Crown size={12} class="text-accent-500" />
              <p class="text-[11px] text-[var(--text-secondary)] font-medium">{$t('home.topSpender')}</p>
            </div>
            <p class="text-sm font-semibold text-[var(--text-primary)] truncate">{biggestSpender}</p>
          </div>
        {/if}

        <div class="p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <div class="flex items-center gap-1.5 mb-1">
            <Receipt size={12} class="text-primary-500" />
            <p class="text-[11px] text-[var(--text-secondary)] font-medium">{$t('home.totalExpenses')}</p>
          </div>
          <p class="text-sm font-semibold text-[var(--text-primary)]">{$appData.expenses.length}</p>
        </div>

        <div class="p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <div class="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} class="text-success-500" />
            <p class="text-[11px] text-[var(--text-secondary)] font-medium">{$t('home.dailyAvg')}</p>
          </div>
          <p class="text-sm font-semibold text-[var(--text-primary)]">
            {settlementCurrencySymbol}{formatAmount(averageDailySpending)}
          </p>
        </div>

        <div class="p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50">
          <div class="flex items-center gap-1.5 mb-1">
            <Calendar size={12} class="text-warning-500" />
            <p class="text-[11px] text-[var(--text-secondary)] font-medium">{$t('home.today')}</p>
          </div>
          <p class="text-sm font-semibold text-[var(--text-primary)]">
            {todayExpenses.length === 1 ? $t('home.todayExpenses', { count: todayExpenses.length }) : $t('home.todayExpensesPlural', { count: todayExpenses.length })}
          </p>
        </div>
      </div>
    </section>
  {/if}

  <!-- Setup Wizard (shown when prerequisites are missing) -->
  {#if $appData.participants.length === 0 || $appData.currencies.length === 0}
    <SetupWizard />
  {:else if $appData.expenses.length === 0}
    <!-- Empty state for trips that are set up but have no expenses -->
    <section
      class="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] border-dashed p-8 text-center"
      in:fly={{ y: 20, duration: 300, delay: 150 }}
    >
      <div class="w-14 h-14 mx-auto rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-4">
        <Receipt size={24} class="text-primary-500" />
      </div>
      <h3 class="text-base font-semibold text-[var(--text-primary)] mb-1">{$t('home.noExpensesTitle')}</h3>
      <p class="text-sm text-[var(--text-secondary)] mb-5 max-w-xs mx-auto">
        {$t('home.noExpensesDesc')}
      </p>
      <div class="flex flex-col sm:flex-row gap-2 justify-center">
        <button
          onclick={() => showExpenseForm = true}
          class="px-4 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-all shadow-sm"
        >
          {$t('home.addFirstExpense')}
        </button>
      </div>
    </section>
  {/if}

  <!-- Spacer for FAB -->
  <div class="h-16 md:h-4"></div>
</div>

<!-- Floating Add Expense Button -->
{#if $appData.participants.length > 0 && $appData.currencies.length > 0}
  <button
    onclick={() => showExpenseForm = true}
    class="fixed bottom-20 md:bottom-8 end-5 md:end-8 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_8px_30px_var(--fab-shadow)] hover:shadow-[0_12px_40px_var(--fab-shadow)] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
    in:fly={{ y: 20, duration: 300, delay: 400 }}
  >
    <Plus size={24} strokeWidth={2.5} />
  </button>
{/if}

<!-- Expense Form Modal -->
{#if showExpenseForm}
  <ExpenseForm
    expense={null}
    onSave={handleExpenseSaved}
    onClose={() => showExpenseForm = false}
  />
{/if}

<!-- Receipt Scanner Modal -->
{#if showReceiptScanner}
  <ReceiptScanner
    onClose={() => showReceiptScanner = false}
    onSaved={() => { showReceiptScanner = false; showToast($t('receipt.expenseSaved')); }}
  />
{/if}
