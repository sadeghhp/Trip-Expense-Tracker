<script lang="ts">
  import { untrack } from 'svelte';
  import { X, Image as ImageIcon } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { appData, addExpense, updateExpense } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { getTodayISO } from '$lib/engine/calendar';
  import { generateId } from '$lib/utils/id';
  import { validateExpense } from '$lib/utils/validation';
  import { formatAmount } from '$lib/utils/format';
  import { getEqualSharePreview } from '$lib/engine/shares';
  import { t } from '$lib/i18n';
  import type { Expense, Beneficiary, SplitType } from '$lib/types';
  import ImageViewer from '../ui/ImageViewer.svelte';
  import ReceiptThumbnail from '../ui/ReceiptThumbnail.svelte';
  import TreatToggle from '../ui/TreatToggle.svelte';

  interface Props {
    /** An existing, stored expense to edit. */
    expense: Expense | null;
    /**
     * Starting values for a NEW expense (used by the pending-import review).
     * Kept separate from `expense` so the form can never mistake a prefill for
     * a stored record and take the edit path, which silently discarded it.
     */
    prefill?: Expense | null;
    onSave: (result?: { expenseId: string }) => void;
    onClose: () => void;
  }

  let { expense, prefill = null, onSave, onClose }: Props = $props();

  let isEditing = $derived(!!expense);
  let initialValues = $derived(expense ?? prefill);

  let date = $state('');
  let description = $state('');
  let currencyCode = $state('');
  let amount = $state('');
  let paidBy = $state('');
  let splitType: SplitType = $state('equal');
  let isTreat = $state(false);
  let selectedBeneficiaries: Set<string> = $state(new Set());
  let customAmounts: Record<string, string> = $state({});
  let customPercentages: Record<string, string> = $state({});

  $effect(() => {
    const e = initialValues;
    untrack(() => {
      date = e?.date ?? getTodayISO();
      description = e?.description ?? '';
      currencyCode = e?.currencyCode ?? $appData.currencies[0]?.code ?? '';
      amount = e?.amount?.toString() ?? '';
      paidBy = e?.paidBy ?? $appData.participants[0]?.id ?? '';
      splitType = e?.splitType ?? 'equal';
      isTreat = e?.isTreat ?? false;
      const tankhahId = $appData.tankhahParticipantId;
      selectedBeneficiaries = new Set(
        e
          ? e.beneficiaries.map(b => b.participantId)
          : $appData.participants.filter(p => p.id !== tankhahId).map(p => p.id)
      );
      customAmounts = Object.fromEntries(
        e ? e.beneficiaries.map(b => [b.participantId, b.customAmount?.toString() ?? '']) : []
      );
      customPercentages = Object.fromEntries(
        e ? e.beneficiaries.map(b => [b.participantId, b.customPercentage?.toString() ?? '']) : []
      );
    });
  });
  let formError = $state('');
  let showReceiptViewer = $state(false);

  let beneficiaryCount = $derived(selectedBeneficiaries.size);
  let parsedAmount = $derived(parseFloat(amount) || 0);

  let equalPerPerson = $derived.by(() => {
    if (beneficiaryCount === 0 || parsedAmount <= 0) return '';
    const { share, exact } = getEqualSharePreview(parsedAmount, paidBy, [...selectedBeneficiaries]);
    return (exact ? '' : '~') + formatAmount(share);
  });

  let customSum = $derived.by(() => {
    let sum = 0;
    for (const pid of selectedBeneficiaries) {
      sum += parseFloat(customAmounts[pid] || '0') || 0;
    }
    return sum;
  });

  let percentageSum = $derived.by(() => {
    let sum = 0;
    for (const pid of selectedBeneficiaries) {
      sum += parseFloat(customPercentages[pid] || '0') || 0;
    }
    return sum;
  });

  let nonTankhahParticipants = $derived(
    $appData.participants.filter(p => p.id !== $appData.tankhahParticipantId)
  );
  let allSelected = $derived(
    nonTankhahParticipants.every(p => selectedBeneficiaries.has(p.id))
    && nonTankhahParticipants.length > 0
  );
  let noneSelected = $derived(selectedBeneficiaries.size === 0);
  let tankhahIncluded = $derived(
    !!$appData.tankhahParticipantId && selectedBeneficiaries.has($appData.tankhahParticipantId)
  );

  function toggleBeneficiary(pid: string) {
    const next = new Set(selectedBeneficiaries);
    if (next.has(pid)) {
      next.delete(pid);
    } else {
      next.add(pid);
    }
    selectedBeneficiaries = next;
  }

  function selectAllBeneficiaries() {
    const tankhahId = $appData.tankhahParticipantId;
    selectedBeneficiaries = new Set(
      $appData.participants.filter(p => p.id !== tankhahId).map(p => p.id)
    );
  }

  function clearAllBeneficiaries() {
    selectedBeneficiaries = new Set();
  }

  function handleSubmit() {
    const amountNum = Math.round(parseFloat(amount) * 100) / 100;
    const effectiveSplitType = isTreat ? 'equal' : splitType;
    const beneficiaries: Beneficiary[] = [...selectedBeneficiaries].map(pid => ({
      participantId: pid,
      customAmount: effectiveSplitType === 'custom' ? (parseFloat(customAmounts[pid] || '0') || 0) : null,
      customPercentage: effectiveSplitType === 'percentage' ? (parseFloat(customPercentages[pid] || '0') || 0) : null
    }));

    const source = initialValues;
    const expenseData: Expense = {
      // An edit keeps its stored id; anything else is a new record and must
      // never inherit an empty id from a prefill.
      id: (isEditing ? expense?.id : source?.id) || generateId(),
      date,
      description: description.trim(),
      currencyCode,
      amount: amountNum,
      paidBy,
      splitType: effectiveSplitType,
      beneficiaries,
      ...(isTreat ? { isTreat: true } : {}),
      ...(source?.journalEntryId
        ? { journalEntryId: source.journalEntryId, source: 'journal' as const }
        : source?.source !== undefined ? { source: source.source } : {}),
      ...(source?.receiptImageId !== undefined && { receiptImageId: source.receiptImageId }),
      ...(source?.aiMetadata !== undefined && { aiMetadata: source.aiMetadata }),
    };

    const error = validateExpense(expenseData, $appData);
    if (error) {
      formError = $t(error.key, error.params);
      return;
    }

    // The store verifies the write landed; only then is the save reported.
    const result = isEditing && expense
      ? updateExpense(expense.id, expenseData)
      : addExpense(expenseData);

    if (!result.success) {
      formError = $t('expenseForm.saveFailed');
      return;
    }

    onSave({ expenseId: expenseData.id });
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
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">
        {expense ? $t('expenseForm.editTitle') : $t('expenseForm.addTitle')}
      </h2>
      <button onclick={onClose} class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors">
        <X size={18} />
      </button>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {#if expense?.receiptImageId}
        <button
          type="button"
          onclick={() => showReceiptViewer = true}
          class="w-full flex items-center gap-3 p-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] hover:border-primary-300 dark:hover:border-primary-700 transition-all"
        >
          <ReceiptThumbnail
            imageId={expense.receiptImageId}
            class="w-12 h-12 rounded-lg object-cover border border-[var(--card-border)]"
          />
          <div class="flex-1 text-start">
            <span class="text-sm font-medium text-[var(--text-primary)]">{$t('receipt.viewReceipt')}</span>
            <p class="text-xs text-[var(--text-secondary)]">{$t('receipt.tapToView')}</p>
          </div>
          <ImageIcon size={16} class="text-[var(--text-secondary)]" />
        </button>
      {/if}

      <!-- Date & Description -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="expense-date" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.date')}</label>
          <input id="expense-date" type="date" bind:value={date}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
        </div>
        <div>
          <label for="expense-currency" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.currency')}</label>
          <select id="expense-currency" bind:value={currencyCode}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {#each $appData.currencies as c}
              <option value={c.code}>{c.symbol} {c.code}</option>
            {/each}
          </select>
        </div>
      </div>

      <div>
        <label for="expense-description" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.description')}</label>
        <input id="expense-description" type="text" bind:value={description} placeholder={$t('expenseForm.descriptionPlaceholder')}
          class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="expense-amount" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.amount')}</label>
          <input id="expense-amount" type="number" bind:value={amount} placeholder="0.00" step="0.01" min="0"
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
        </div>
        <div>
          <label for="expense-paid-by" class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.paidBy')}</label>
          <select id="expense-paid-by" bind:value={paidBy}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {#each $appData.participants as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <TreatToggle checked={isTreat} onToggle={() => isTreat = !isTreat} />

      <!-- Split type -->
      {#if !isTreat}
      <div role="group" aria-labelledby="split-type-label">
        <span id="split-type-label" class="block text-xs font-medium text-[var(--text-secondary)] mb-2">{$t('expenseForm.splitType')}</span>
        <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
          {#each ['equal', 'custom', 'percentage'] as st}
            <button
              type="button"
              onclick={() => splitType = st as SplitType}
              class="flex-1 py-2 text-xs font-medium transition-all
                {splitType === st
                  ? 'bg-primary-600 text-white'
                  : 'bg-[var(--app-bg)] text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
            >
              {$t(`expenseForm.${st}`)}
            </button>
          {/each}
        </div>
      </div>
      {/if}

      <!-- Beneficiaries -->
      <div role="group" aria-labelledby="beneficiaries-label">
        <div class="flex items-center justify-between mb-2">
          <span id="beneficiaries-label" class="text-xs font-medium text-[var(--text-secondary)]">
            {$t('expenseForm.beneficiaries', { count: beneficiaryCount })}
          </span>
          <div class="flex items-center gap-2">
            {#if !allSelected}
              <button
                type="button"
                onclick={selectAllBeneficiaries}
                class="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline"
              >
                {$t('expenseForm.selectAll')}
              </button>
            {/if}
            {#if !noneSelected && !allSelected}
              <span class="text-xs text-[var(--text-secondary)]">·</span>
            {/if}
            {#if !noneSelected}
              <button
                type="button"
                onclick={clearAllBeneficiaries}
                class="text-xs text-[var(--text-secondary)] font-medium hover:underline"
              >
                {$t('expenseForm.clearAll')}
              </button>
            {/if}
          </div>
        </div>
        <div class="space-y-2 max-h-48 overflow-y-auto">
          {#each $appData.participants as p (p.id)}
            {@const selected = selectedBeneficiaries.has(p.id)}
            {@const pIsTankhah = p.id === $appData.tankhahParticipantId}
            {#if !pIsTankhah}
              <div class="flex items-center gap-3 p-2 rounded-xl {selected ? 'bg-primary-50 dark:bg-primary-900/20' : ''}">
                <button
                  type="button"
                  onclick={() => toggleBeneficiary(p.id)}
                  class="w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all
                    {selected ? 'border-primary-600 bg-primary-600' : 'border-[var(--card-border)]'}"
                >
                  {#if selected}
                    <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  {/if}
                </button>
                <span class="text-sm text-[var(--text-primary)] flex-1">{p.name}</span>

                {#if selected && splitType === 'custom' && !isTreat}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={customAmounts[p.id] ?? ''}
                    oninput={(e) => customAmounts[p.id] = (e.target as HTMLInputElement).value}
                    class="w-24 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-end focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                {/if}
                {#if selected && splitType === 'percentage' && !isTreat}
                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      value={customPercentages[p.id] ?? ''}
                      oninput={(e) => customPercentages[p.id] = (e.target as HTMLInputElement).value}
                      class="w-20 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-end focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <span class="text-xs text-[var(--text-secondary)]">%</span>
                  </div>
                {/if}
              </div>
            {/if}
          {/each}

          {#if $appData.tankhahParticipantId}
            {@const tankhahP = $appData.participants.find(p => p.id === $appData.tankhahParticipantId)}
            {#if tankhahP}
              <div class="flex items-center gap-3 p-2 rounded-xl border border-dashed {tankhahIncluded ? 'bg-accent-50 dark:bg-accent-900/20 border-accent-300 dark:border-accent-700' : 'border-[var(--card-border)]'}">
                <button
                  type="button"
                  onclick={() => toggleBeneficiary(tankhahP.id)}
                  class="w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all
                    {tankhahIncluded ? 'border-accent-600 bg-accent-600' : 'border-[var(--card-border)]'}"
                >
                  {#if tankhahIncluded}
                    <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  {/if}
                </button>
                <span class="text-sm text-accent-700 dark:text-accent-300 flex-1 flex items-center gap-1.5">
                  {tankhahP.name}
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400">
                    {$t('participants.tankhahBadge')}
                  </span>
                </span>

                {#if tankhahIncluded && splitType === 'custom'}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={customAmounts[tankhahP.id] ?? ''}
                    oninput={(e) => customAmounts[tankhahP.id] = (e.target as HTMLInputElement).value}
                    class="w-24 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-end focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                {/if}
                {#if tankhahIncluded && splitType === 'percentage'}
                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      value={customPercentages[tankhahP.id] ?? ''}
                      oninput={(e) => customPercentages[tankhahP.id] = (e.target as HTMLInputElement).value}
                      class="w-20 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-end focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <span class="text-xs text-[var(--text-secondary)]">%</span>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <!-- Live preview -->
      {#if isTreat && beneficiaryCount > 0 && parsedAmount > 0}
        <div class="px-3 py-2 rounded-xl bg-accent-50 dark:bg-accent-900/20 border border-accent-100 dark:border-accent-800 text-xs text-accent-700 dark:text-accent-300">
          {$t('expenseForm.treatHint')}
        </div>
      {/if}
      {#if !isTreat && splitType === 'equal' && beneficiaryCount > 0 && parsedAmount > 0}
        <div class="px-3 py-2 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 text-xs text-primary-700 dark:text-primary-300">
          {$t('expenseForm.equalPreview', { amount: equalPerPerson, count: beneficiaryCount, label: beneficiaryCount === 1 ? $t('common.person') : $t('common.people') })}
        </div>
      {/if}
      {#if !isTreat && splitType === 'custom'}
        <div class="px-3 py-2 rounded-xl text-xs {Math.abs(customSum - parsedAmount) < 0.01 ? 'bg-success-500/10 text-success-600' : 'bg-danger-500/10 text-danger-500'}">
          {$t('expenseForm.customSum', { sum: formatAmount(customSum), total: formatAmount(parsedAmount) })}
          {Math.abs(customSum - parsedAmount) < 0.01 ? '✓' : '✗'}
        </div>
      {/if}
      {#if !isTreat && splitType === 'percentage'}
        <div class="px-3 py-2 rounded-xl text-xs {Math.abs(percentageSum - 100) < 0.01 ? 'bg-success-500/10 text-success-600' : 'bg-danger-500/10 text-danger-500'}">
          {$t('expenseForm.percentageSum', { sum: percentageSum.toFixed(2) })}
          {Math.abs(percentageSum - 100) < 0.01 ? '✓' : '✗'}
        </div>
      {/if}

      {#if formError}
        <p class="text-xs text-danger-500 px-1">{formError}</p>
      {/if}

      <button
        type="submit"
        class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
      >
        {expense ? $t('expenseForm.updateExpense') : $t('expenseForm.addExpense')}
      </button>
    </form>
  </div>
</div>

{#if showReceiptViewer && expense?.receiptImageId}
  <ImageViewer imageId={expense.receiptImageId} onClose={() => showReceiptViewer = false} />
{/if}
