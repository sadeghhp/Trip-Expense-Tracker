<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Plus, Pencil, Trash2, Receipt } from '@lucide/svelte';
  import { appData, updateData } from '$lib/stores/data';
  import { settings } from '$lib/stores/settings';
  import { formatDateDisplay } from '$lib/engine/calendar';
  import { formatAmount } from '$lib/utils/format';
  import type { Expense } from '$lib/types';
  import ExpenseForm from './ExpenseForm.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import EmptyState from '../layout/EmptyState.svelte';

  interface Props {
    showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  }

  let { showToast }: Props = $props();

  let showForm = $state(false);
  let editingExpense: Expense | null = $state(null);
  let deleteConfirm: Expense | null = $state(null);

  let sortedExpenses = $derived(
    [...$appData.expenses].sort((a, b) => b.date.localeCompare(a.date))
  );

  function openAdd() {
    if ($appData.participants.length === 0 || $appData.currencies.length === 0) {
      showToast('Add at least one participant and one currency first.', 'error');
      return;
    }
    editingExpense = null;
    showForm = true;
  }

  function openEdit(e: Expense) {
    editingExpense = e;
    showForm = true;
  }

  function handleSaved() {
    showForm = false;
    showToast(editingExpense ? 'Expense updated' : 'Expense added');
    editingExpense = null;
  }

  function requestDelete(e: Expense) {
    deleteConfirm = e;
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    updateData(d => ({
      ...d,
      expenses: d.expenses.filter(e => e.id !== id)
    }));
    showToast('Expense deleted');
    deleteConfirm = null;
  }

  function getCurrencySymbol(code: string): string {
    return $appData.currencies.find(c => c.code === code)?.symbol ?? code;
  }

  function getPayerName(id: string): string {
    return $appData.participants.find(p => p.id === id)?.name ?? 'Unknown';
  }
</script>

<div class="p-4 md:p-6 space-y-4">
  {#if sortedExpenses.length === 0}
    <EmptyState
      icon={Receipt}
      title="No expenses yet"
      description="Start recording shared expenses for your trip."
    >
      <button
        onclick={openAdd}
        class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-medium transition-all hover:shadow-md active:scale-95"
      >
        Add First Expense
      </button>
    </EmptyState>
  {:else}
    <div class="space-y-3">
      {#each sortedExpenses as expense, i (expense.id)}
        <div
          class="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200"
          in:fly={{ y: 15, duration: 250, delay: i * 50 }}
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-base font-semibold text-[var(--text-primary)] truncate">{expense.description}</span>
                <span class="shrink-0 px-2 py-0.5 rounded-lg bg-surface-100 dark:bg-surface-800 text-[10px] font-bold tracking-wide uppercase text-[var(--text-secondary)]">
                  {expense.currencyCode}
                </span>
              </div>
              <div class="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                <span>{formatDateDisplay(expense.date, $settings.calendar)}</span>
                <span>paid by {getPayerName(expense.paidBy)}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 ml-3">
              <span class="text-lg font-bold text-[var(--text-primary)]">
                {getCurrencySymbol(expense.currencyCode)}{formatAmount(expense.amount)}
              </span>
              <div class="flex gap-0.5">
                <button
                  onclick={() => openEdit(expense)}
                  class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
                >
                  <Pencil size={14} class="text-[var(--text-secondary)]" />
                </button>
                <button
                  onclick={() => requestDelete(expense)}
                  class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-danger-500/10 active:scale-90 transition-all"
                >
                  <Trash2 size={14} class="text-danger-500" />
                </button>
              </div>
            </div>
          </div>
          <div class="mt-2 flex items-center gap-1 flex-wrap">
            <span class="text-[10px] tracking-wide uppercase text-[var(--text-secondary)]">Split ({expense.splitType}):</span>
            {#each expense.beneficiaries.slice(0, 4) as b}
              {@const name = getPayerName(b.participantId)}
              <span class="px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 text-[10px] font-medium text-primary-700 dark:text-primary-300">
                {name}
              </span>
            {/each}
            {#if expense.beneficiaries.length > 4}
              <span class="text-[10px] text-[var(--text-secondary)]">+{expense.beneficiaries.length - 4} more</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <button
    onclick={openAdd}
    class="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 hover:scale-105 text-white shadow-lg shadow-[var(--fab-shadow)] flex items-center justify-center transition-all active:scale-90"
  >
    <Plus size={24} />
  </button>
</div>

{#if showForm}
  <ExpenseForm
    expense={editingExpense}
    onSave={handleSaved}
    onClose={() => { showForm = false; editingExpense = null; }}
    {showToast}
  />
{/if}

<ConfirmDialog
  open={deleteConfirm !== null}
  title="Delete Expense"
  message="Are you sure you want to delete this expense?"
  confirmLabel="Delete"
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>
