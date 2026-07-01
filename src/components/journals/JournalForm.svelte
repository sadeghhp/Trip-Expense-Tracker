<script lang="ts">
  import { untrack } from 'svelte';
  import { X } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { appData, updateJournalEntry } from '$lib/stores/data';
  import { t } from '$lib/i18n';
  import type { JournalEntry } from '$lib/types';
  import JournalApplyPreview from './JournalApplyPreview.svelte';

  interface Props {
    entry: JournalEntry;
    onSave: () => void;
    onClose: () => void;
  }

  let { entry, onSave, onClose }: Props = $props();

  let date = $state('');
  let description = $state('');
  let currencyCode = $state('');
  let amount = $state('');
  let payerName = $state('');
  let payeeName = $state('');
  let entryType = $state('');
  let notes = $state('');
  let showRawData = $state(false);
  let formError = $state('');

  const ENTRY_TYPES = [
    'expense', 'expense_personal', 'expense_group', 'expense_from_tankhah',
    'expense_alipay', 'payment_from_tankhah', 'withdrawal', 'cash_transfer',
    'advance_received', 'loan_disbursement', 'allowance_grant', 'debt_statement'
  ];

  $effect(() => {
    const e = entry;
    untrack(() => {
      date = e.date ?? '';
      description = e.description ?? '';
      currencyCode = e.currencyCode ?? $appData.currencies[0]?.code ?? '';
      amount = e.amount?.toString() ?? '';
      payerName = e.payerName ?? '';
      payeeName = e.payeeName ?? '';
      entryType = e.entryType ?? '';
      notes = e.notes ?? '';
    });
  });

  let draftEntry = $derived.by((): JournalEntry => ({
    ...entry,
    date,
    description: description.trim(),
    currencyCode,
    amount: Math.round(parseFloat(amount) * 100) / 100 || 0,
    payerName: payerName.trim(),
    payeeName: payeeName.trim(),
    entryType,
    notes: notes.trim() || undefined
  }));

  function handleSubmit() {
    if (!date || !description.trim() || !currencyCode || !payerName.trim()) {
      formError = $t('journals.requiredFields');
      return;
    }
    const amountNum = Math.round(parseFloat(amount) * 100) / 100;
    if (!amountNum || amountNum <= 0) {
      formError = $t('validation.amountPositive');
      return;
    }

    updateJournalEntry(entry.id, {
      date,
      description: description.trim(),
      currencyCode,
      amount: amountNum,
      payerName: payerName.trim(),
      payeeName: payeeName.trim(),
      entryType,
      notes: notes.trim() || undefined,
      status: entry.status === 'applied' ? 'out_of_sync' : (entry.status === 'out_of_sync' ? 'out_of_sync' : 'pending')
    });
    formError = '';
    onSave();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  transition:fly={{ duration: 150 }}
>
  <div
    class="w-full md:max-w-lg md:mx-4 bg-[var(--card-bg)] rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col safe-area-bottom"
    transition:fly={{ y: 100, duration: 250 }}
  >
    <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)] shrink-0">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">{$t('journals.editTitle')}</h2>
      <button onclick={onClose} class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors">
        <X size={18} />
      </button>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="journal-date" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.date')}</label>
          <input id="journal-date" type="date" bind:value={date}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
        </div>
        <div>
          <label for="journal-currency" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.currency')}</label>
          <select id="journal-currency" bind:value={currencyCode}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50">
            {#each $appData.currencies as c}
              <option value={c.code}>{c.symbol} {c.code}</option>
            {/each}
          </select>
        </div>
      </div>

      <div>
        <label for="journal-description" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.description')}</label>
        <input id="journal-description" type="text" bind:value={description}
          class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="journal-amount" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.amount')}</label>
          <input id="journal-amount" type="number" bind:value={amount} step="0.01" min="0"
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
        </div>
        <div>
          <label for="journal-entry-type" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('journals.entryType')}</label>
          <select id="journal-entry-type" bind:value={entryType}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50">
            <option value="">—</option>
            {#each ENTRY_TYPES as et}
              <option value={et}>{et}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="journal-payer" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('journals.payer')}</label>
          <input id="journal-payer" type="text" bind:value={payerName} list="journal-participants"
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
        </div>
        <div>
          <label for="journal-payee" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('journals.payee')}</label>
          <input id="journal-payee" type="text" bind:value={payeeName} list="journal-participants"
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
        </div>
      </div>
      <datalist id="journal-participants">
        {#each $appData.participants as p}
          <option value={p.name}></option>
        {/each}
      </datalist>

      <div>
        <label for="journal-notes" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('journals.notes')}</label>
        <input id="journal-notes" type="text" bind:value={notes}
          class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
      </div>

      <JournalApplyPreview entry={draftEntry} />

      <button type="button" onclick={() => showRawData = !showRawData}
        class="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline">
        {showRawData ? $t('journals.hideRawData') : $t('journals.showRawData')}
      </button>
      {#if showRawData}
        <div class="p-3 rounded-xl bg-[var(--app-bg)] border border-[var(--card-border)] text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
          {#each Object.entries(entry.rawData) as [key, value]}
            <div><span class="text-[var(--text-secondary)]">{key}:</span> {value}</div>
          {/each}
        </div>
      {/if}

      {#if formError}
        <p class="text-xs text-danger-500">{formError}</p>
      {/if}

      <button type="submit"
        class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white text-sm font-semibold">
        {$t('common.save')}
      </button>
    </form>
  </div>
</div>
