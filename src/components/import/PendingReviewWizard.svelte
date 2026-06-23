<script lang="ts">
  import { AlertTriangle, ChevronLeft, ChevronRight, Check, X, FileText } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { t } from '$lib/i18n';
  import { appData, removePendingItem } from '$lib/stores/data';
  import type { PendingImportItem, Expense } from '$lib/types';
  import { formatAmount } from '$lib/utils/format';
  import ExpenseForm from '../expenses/ExpenseForm.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let currentIndex = $state(0);
  let addedCount = $state(0);
  let dismissedCount = $state(0);
  let showExpenseForm = $state(false);
  let showRawData = $state(false);
  let showSummary = $state(false);
  let pendingItemForForm: PendingImportItem | null = $state(null);

  let items = $derived($appData.pendingImports);
  let currentItem = $derived(items[currentIndex] ?? null);
  let total = $derived(items.length);

  function reset() {
    currentIndex = 0;
    addedCount = 0;
    dismissedCount = 0;
    showExpenseForm = false;
    showRawData = false;
    showSummary = false;
    pendingItemForForm = null;
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleDismiss() {
    if (!currentItem) return;
    removePendingItem(currentItem.id);
    dismissedCount++;
    if (currentIndex >= items.length) {
      currentIndex = Math.max(0, items.length - 1);
    }
    if (items.length === 0) {
      showSummary = true;
    }
  }

  function handleSkip() {
    if (currentIndex < total - 1) {
      currentIndex++;
    } else {
      showSummary = true;
    }
  }

  function handleFixAndAdd() {
    pendingItemForForm = currentItem;
    showExpenseForm = true;
  }

  function handleExpenseSaved() {
    showExpenseForm = false;
    if (pendingItemForForm) {
      removePendingItem(pendingItemForForm.id);
      addedCount++;
      pendingItemForForm = null;
    }
    if (currentIndex >= items.length) {
      currentIndex = Math.max(0, items.length - 1);
    }
    if (items.length === 0) {
      showSummary = true;
    }
  }

  function handleExpenseFormClose() {
    showExpenseForm = false;
    pendingItemForForm = null;
  }

  function buildPrefilledExpense(): Expense | null {
    if (!pendingItemForForm) return null;
    const item = pendingItemForForm;
    const payerId = item.payerName
      ? $appData.participants.find(p => p.name.toLowerCase() === item.payerName!.toLowerCase())?.id
      : undefined;

    return {
      id: '',
      date: item.date ?? '',
      description: item.description ?? '',
      currencyCode: item.currencyCode ?? $appData.currencies[0]?.code ?? '',
      amount: item.amount ?? 0,
      paidBy: payerId ?? $appData.participants[0]?.id ?? '',
      splitType: 'equal',
      beneficiaries: $appData.participants.map(p => ({
        participantId: p.id,
        customAmount: null,
        customPercentage: null
      }))
    };
  }

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape' && !showExpenseForm) handleClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    transition:fly={{ duration: 150 }}
  >
    <div
      class="w-full md:max-w-lg md:mx-4 bg-[var(--card-bg)] rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col safe-area-bottom"
      transition:fly={{ y: 100, duration: 250 }}
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">{$t('pending.wizardTitle')}</h2>
        <button
          onclick={handleClose}
          class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        {#if showSummary}
          <div class="space-y-4 text-center py-6">
            <div class="w-14 h-14 mx-auto rounded-full bg-success-500/10 flex items-center justify-center">
              <Check size={28} class="text-success-600" />
            </div>
            <h3 class="text-lg font-semibold text-[var(--text-primary)]">{$t('pending.summaryTitle')}</h3>
            <div class="space-y-2 text-sm text-[var(--text-secondary)]">
              {#if addedCount > 0}
                <p>{$t('pending.summaryAdded', { count: addedCount })}</p>
              {/if}
              {#if items.length > 0}
                <p>{$t('pending.summaryRemaining', { count: items.length })}</p>
              {/if}
              {#if dismissedCount > 0}
                <p>{$t('pending.summaryDismissed', { count: dismissedCount })}</p>
              {/if}
            </div>
            <button
              onclick={handleClose}
              class="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white text-sm font-semibold"
            >
              {$t('pending.done')}
            </button>
          </div>
        {:else if total === 0}
          <div class="text-center py-8 text-sm text-[var(--text-secondary)]">
            {$t('pending.noItems')}
          </div>
        {:else if currentItem}
          <!-- Progress -->
          <div class="mb-4">
            <div class="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>{$t('pending.progress', { current: currentIndex + 1, total })}</span>
            </div>
            <div class="h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden">
              <div
                class="h-full rounded-full bg-primary-500 transition-all duration-300"
                style="width: {((currentIndex + 1) / total) * 100}%"
              ></div>
            </div>
          </div>

          <!-- Reason badge -->
          <div class="mb-3 px-3 py-2 rounded-xl bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800/50">
            <div class="flex items-start gap-2">
              <AlertTriangle size={14} class="text-warning-600 dark:text-warning-400 shrink-0 mt-0.5" />
              <span class="text-xs text-warning-800 dark:text-warning-200">{currentItem.reason}</span>
            </div>
          </div>

          <!-- Pre-parsed fields -->
          <div class="space-y-2 mb-4">
            {#if currentItem.description}
              <div class="flex justify-between text-sm">
                <span class="text-[var(--text-secondary)]">{$t('expenseForm.description')}</span>
                <span class="text-[var(--text-primary)] font-medium">{currentItem.description}</span>
              </div>
            {/if}
            {#if currentItem.amount}
              <div class="flex justify-between text-sm">
                <span class="text-[var(--text-secondary)]">{$t('expenseForm.amount')}</span>
                <span class="text-[var(--text-primary)] font-medium">{formatAmount(currentItem.amount)} {currentItem.currencyCode ?? ''}</span>
              </div>
            {/if}
            {#if currentItem.date}
              <div class="flex justify-between text-sm">
                <span class="text-[var(--text-secondary)]">{$t('expenseForm.date')}</span>
                <span class="text-[var(--text-primary)] font-medium">{currentItem.date}</span>
              </div>
            {/if}
            {#if currentItem.payerName}
              <div class="flex justify-between text-sm">
                <span class="text-[var(--text-secondary)]">{$t('pending.payer')}</span>
                <span class="text-[var(--text-primary)] font-medium">{currentItem.payerName}</span>
              </div>
            {/if}
            {#if currentItem.payeeName}
              <div class="flex justify-between text-sm">
                <span class="text-[var(--text-secondary)]">{$t('pending.payee')}</span>
                <span class="text-[var(--text-primary)] font-medium">{currentItem.payeeName}</span>
              </div>
            {/if}
          </div>

          <!-- Raw data toggle -->
          <button
            onclick={() => showRawData = !showRawData}
            class="flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3 transition-colors"
          >
            <FileText size={12} />
            <span>{$t('pending.rawData')}</span>
            <span class="text-[10px]">{showRawData ? '▲' : '▼'}</span>
          </button>
          {#if showRawData}
            <div class="mb-4 p-3 rounded-xl bg-[var(--app-bg)] border border-[var(--card-border)] text-xs space-y-1 max-h-40 overflow-y-auto">
              {#each Object.entries(currentItem.rawData) as [key, value]}
                <div class="flex gap-2">
                  <span class="text-[var(--text-secondary)] shrink-0 font-mono">{key}:</span>
                  <span class="text-[var(--text-primary)]">{value}</span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex flex-col gap-2 mt-4">
            <button
              onclick={handleFixAndAdd}
              class="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all"
            >
              {$t('pending.fixAndAdd')}
            </button>
            <div class="flex gap-2">
              <button
                onclick={handleSkip}
                class="flex-1 py-2.5 rounded-xl border border-[var(--card-border)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--app-bg)] transition-all"
              >
                {$t('pending.skipForLater')}
              </button>
              <button
                onclick={handleDismiss}
                class="flex-1 py-2.5 rounded-xl border border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400 text-sm font-medium hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-all"
              >
                {$t('pending.dismiss')}
              </button>
            </div>
          </div>

          <!-- Navigation arrows -->
          {#if total > 1}
            <div class="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-[var(--card-border)]">
              <button
                onclick={() => { if (currentIndex > 0) currentIndex--; }}
                disabled={currentIndex === 0}
                class="w-8 h-8 rounded-lg flex items-center justify-center border border-[var(--card-border)] disabled:opacity-30 hover:bg-[var(--app-bg)] transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <span class="text-xs text-[var(--text-secondary)]">{currentIndex + 1} / {total}</span>
              <button
                onclick={() => { if (currentIndex < total - 1) currentIndex++; }}
                disabled={currentIndex >= total - 1}
                class="w-8 h-8 rounded-lg flex items-center justify-center border border-[var(--card-border)] disabled:opacity-30 hover:bg-[var(--app-bg)] transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if showExpenseForm}
  {@const prefilled = buildPrefilledExpense()}
  {#if prefilled}
    <ExpenseForm
      expense={prefilled}
      onSave={handleExpenseSaved}
      onClose={handleExpenseFormClose}
    />
  {/if}
{/if}
