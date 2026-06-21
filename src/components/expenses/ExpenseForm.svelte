<script lang="ts">
  import { X } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { appData, updateData } from '$lib/stores/data';
  import { getTodayISO } from '$lib/engine/calendar';
  import { generateId } from '$lib/utils/id';
  import { validateExpense } from '$lib/utils/validation';
  import { formatAmount } from '$lib/utils/format';
  import type { Expense, Beneficiary, SplitType } from '$lib/types';

  interface Props {
    expense: Expense | null;
    onSave: () => void;
    onClose: () => void;
    showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  }

  let { expense, onSave, onClose, showToast }: Props = $props();

  let date = $state(expense?.date ?? getTodayISO());
  let description = $state(expense?.description ?? '');
  let currencyCode = $state(expense?.currencyCode ?? $appData.currencies[0]?.code ?? '');
  let amount = $state(expense?.amount?.toString() ?? '');
  let paidBy = $state(expense?.paidBy ?? $appData.participants[0]?.id ?? '');
  let splitType: SplitType = $state(expense?.splitType ?? 'equal');
  let selectedBeneficiaries: Set<string> = $state(
    new Set(expense ? expense.beneficiaries.map(b => b.participantId) : $appData.participants.map(p => p.id))
  );
  let customAmounts: Record<string, string> = $state(
    Object.fromEntries(expense ? expense.beneficiaries.map(b => [b.participantId, b.customAmount?.toString() ?? '']) : [])
  );
  let customPercentages: Record<string, string> = $state(
    Object.fromEntries(expense ? expense.beneficiaries.map(b => [b.participantId, b.customPercentage?.toString() ?? '']) : [])
  );
  let formError = $state('');

  let beneficiaryCount = $derived(selectedBeneficiaries.size);
  let parsedAmount = $derived(parseFloat(amount) || 0);

  let equalPerPerson = $derived.by(() => {
    if (beneficiaryCount === 0 || parsedAmount <= 0) return '';
    const totalCents = Math.round(parsedAmount * 100);
    const perPerson = Math.floor(totalCents / beneficiaryCount) / 100;
    return formatAmount(perPerson);
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

  function toggleBeneficiary(pid: string) {
    const next = new Set(selectedBeneficiaries);
    if (next.has(pid)) {
      next.delete(pid);
    } else {
      next.add(pid);
    }
    selectedBeneficiaries = next;
  }

  function handleSubmit() {
    const amountNum = Math.round(parseFloat(amount) * 100) / 100;
    const beneficiaries: Beneficiary[] = [...selectedBeneficiaries].map(pid => ({
      participantId: pid,
      customAmount: splitType === 'custom' ? (parseFloat(customAmounts[pid] || '0') || 0) : null,
      customPercentage: splitType === 'percentage' ? (parseFloat(customPercentages[pid] || '0') || 0) : null
    }));

    const expenseData: Expense = {
      id: expense?.id ?? generateId(),
      date,
      description: description.trim(),
      currencyCode,
      amount: amountNum,
      paidBy,
      splitType,
      beneficiaries
    };

    const error = validateExpense(expenseData, $appData);
    if (error) {
      formError = error;
      return;
    }

    if (expense) {
      updateData(d => ({
        ...d,
        expenses: d.expenses.map(e => e.id === expense!.id ? expenseData : e)
      }));
    } else {
      updateData(d => ({
        ...d,
        expenses: [...d.expenses, expenseData]
      }));
    }
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
    class="w-full md:max-w-lg md:mx-4 bg-[var(--card-bg)] rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
    transition:fly={{ y: 100, duration: 250 }}
  >
    <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)] shrink-0">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">
        {expense ? 'Edit Expense' : 'Add Expense'}
      </h2>
      <button onclick={onClose} class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
        <X size={18} />
      </button>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      <!-- Date & Description -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">Date</label>
          <input type="date" bind:value={date}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">Currency</label>
          <select bind:value={currencyCode}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {#each $appData.currencies as c}
              <option value={c.code}>{c.symbol} {c.code}</option>
            {/each}
          </select>
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">Description</label>
        <input type="text" bind:value={description} placeholder="What was this expense for?"
          class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">Amount</label>
          <input type="number" bind:value={amount} placeholder="0.00" step="0.01" min="0"
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">Paid by</label>
          <select bind:value={paidBy}
            class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {#each $appData.participants as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Split type -->
      <div>
        <label class="block text-xs font-medium text-[var(--text-secondary)] mb-2">Split Type</label>
        <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
          {#each ['equal', 'custom', 'percentage'] as st}
            <button
              type="button"
              onclick={() => splitType = st as SplitType}
              class="flex-1 py-2 text-xs font-medium transition-all capitalize
                {splitType === st
                  ? 'bg-primary-600 text-white'
                  : 'bg-[var(--app-bg)] text-[var(--text-secondary)] hover:bg-surface-100 dark:hover:bg-surface-800'}"
            >
              {st}
            </button>
          {/each}
        </div>
      </div>

      <!-- Beneficiaries -->
      <div>
        <label class="block text-xs font-medium text-[var(--text-secondary)] mb-2">
          Beneficiaries ({beneficiaryCount})
        </label>
        <div class="space-y-2 max-h-48 overflow-y-auto">
          {#each $appData.participants as p (p.id)}
            {@const selected = selectedBeneficiaries.has(p.id)}
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

              {#if selected && splitType === 'custom'}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={customAmounts[p.id] ?? ''}
                  oninput={(e) => customAmounts[p.id] = (e.target as HTMLInputElement).value}
                  class="w-24 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              {/if}
              {#if selected && splitType === 'percentage'}
                <div class="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={customPercentages[p.id] ?? ''}
                    oninput={(e) => customPercentages[p.id] = (e.target as HTMLInputElement).value}
                    class="w-20 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <span class="text-xs text-[var(--text-secondary)]">%</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Live preview -->
      {#if splitType === 'equal' && beneficiaryCount > 0 && parsedAmount > 0}
        <div class="px-3 py-2 rounded-xl bg-surface-100 dark:bg-surface-800 text-xs text-[var(--text-secondary)]">
          {equalPerPerson} each ({beneficiaryCount} {beneficiaryCount === 1 ? 'person' : 'people'})
        </div>
      {/if}
      {#if splitType === 'custom'}
        <div class="px-3 py-2 rounded-xl text-xs {Math.abs(customSum - parsedAmount) < 0.01 ? 'bg-success-500/10 text-success-600' : 'bg-danger-500/10 text-danger-500'}">
          Sum: {formatAmount(customSum)} / {formatAmount(parsedAmount)}
          {Math.abs(customSum - parsedAmount) < 0.01 ? '✓' : '✗'}
        </div>
      {/if}
      {#if splitType === 'percentage'}
        <div class="px-3 py-2 rounded-xl text-xs {Math.abs(percentageSum - 100) < 0.01 ? 'bg-success-500/10 text-success-600' : 'bg-danger-500/10 text-danger-500'}">
          Sum: {percentageSum.toFixed(2)}% / 100%
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
        {expense ? 'Update Expense' : 'Add Expense'}
      </button>
    </form>
  </div>
</div>
