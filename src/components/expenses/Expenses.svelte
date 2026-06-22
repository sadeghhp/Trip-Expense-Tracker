<script lang="ts">
  import { Plus, Pencil, Trash2, Receipt, AlertTriangle } from '@lucide/svelte';
  import { appData, updateData } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { settings } from '$lib/stores/settings';
  import { formatDateDisplay } from '$lib/engine/calendar';
  import { formatAmount, getParticipantName, getCurrencySymbol } from '$lib/utils/format';
  import { deleteReceiptImage } from '$lib/services/imageStore';
  import { t } from '$lib/i18n';
  import type { Expense, TabId } from '$lib/types';
  import ExpenseForm from './ExpenseForm.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import EmptyState from '../layout/EmptyState.svelte';
  import ImageViewer from '../ui/ImageViewer.svelte';
  import ReceiptThumbnail from '../ui/ReceiptThumbnail.svelte';

  interface Props {
    onNavigate?: (tab: TabId) => void;
  }

  let { onNavigate }: Props = $props();

  let showForm = $state(false);
  let editingExpense: Expense | null = $state(null);
  let deleteConfirm: Expense | null = $state(null);
  let viewingImageId: string | null = $state(null);

  let sortedExpenses = $derived(
    [...$appData.expenses].sort((a, b) => b.date.localeCompare(a.date))
  );

  function openAdd() {
    if ($appData.participants.length === 0 || $appData.currencies.length === 0) {
      showToast($t('expenses.needParticipantAndCurrency'), 'error');
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
    showToast(editingExpense ? $t('expenses.updated') : $t('expenses.added'));
    editingExpense = null;
  }

  function requestDelete(e: Expense) {
    deleteConfirm = e;
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    if (deleteConfirm.receiptImageId) {
      deleteReceiptImage(deleteConfirm.receiptImageId).catch(() => {});
    }
    updateData(d => ({
      ...d,
      expenses: d.expenses.filter(e => e.id !== id)
    }));
    showToast($t('expenses.deleted'));
    deleteConfirm = null;
  }

  let hasPrerequisites = $derived($appData.participants.length > 0 && $appData.currencies.length > 0);

  function symbolFor(code: string): string {
    return getCurrencySymbol(code, $appData.currencies);
  }

  function nameFor(id: string): string {
    return getParticipantName(id, $appData.participants);
  }
</script>

<div class="p-4 md:p-6 space-y-4">
  {#if $appData.participants.length === 0 || $appData.currencies.length === 0}
    <div class="p-4 rounded-xl bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800/50">
      <div class="flex items-start gap-3">
        <AlertTriangle size={18} class="text-warning-600 dark:text-warning-400 shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-medium text-warning-800 dark:text-warning-200">
            {$t('wizard.setupRequired')}
          </p>
          {#if onNavigate}
            <button
              onclick={() => onNavigate?.('home')}
              class="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {$t('wizard.goToSetup')}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if sortedExpenses.length === 0}
    <EmptyState
      icon={Receipt}
      title={$t('expenses.noExpensesTitle')}
      description={$t('expenses.noExpensesDesc')}
    >
      <button
        onclick={openAdd}
        class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-medium transition-all hover:shadow-md active:scale-95"
      >
        {$t('expenses.addFirstExpense')}
      </button>
    </EmptyState>
  {:else}
    <div class="space-y-3">
      {#each sortedExpenses as expense, i (expense.id)}
        <div
          class="relative p-4 ps-9 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200"
        >
          <span class="absolute start-0 top-0 bottom-0 w-7 flex items-center justify-center text-[10px] font-semibold text-primary-400/70 dark:text-primary-500/50 select-none">
            {sortedExpenses.length - i}
          </span>
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-3 flex-1 min-w-0">
              {#if expense.receiptImageId}
                <ReceiptThumbnail
                  imageId={expense.receiptImageId}
                  class="shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-[var(--card-border)] hover:ring-2 hover:ring-primary-500/50 transition-all"
                  onclick={(e) => { e.stopPropagation(); viewingImageId = expense.receiptImageId!; }}
                />
              {/if}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-base font-semibold text-[var(--text-primary)] truncate">{expense.description}</span>
                  <span class="shrink-0 px-2 py-0.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-[10px] font-bold tracking-wide uppercase text-primary-600 dark:text-primary-300">
                    {expense.currencyCode}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <span>{formatDateDisplay(expense.date, $settings.calendar)}</span>
                  <span>{$t('expenses.paidBy', { name: nameFor(expense.paidBy) })}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 ms-3">
              <span class="text-lg font-bold text-[var(--text-primary)]">
                {symbolFor(expense.currencyCode)}{formatAmount(expense.amount)}
              </span>
              <div class="flex gap-0.5">
                <button
                  onclick={() => openEdit(expense)}
                  class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] active:scale-90 transition-all"
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
            <span class="text-[10px] tracking-wide uppercase text-[var(--text-secondary)]">{$t('expenses.split', { type: $t(`expenseForm.${expense.splitType}`) })}</span>
            {#each expense.beneficiaries.slice(0, 4) as b}
              {@const name = nameFor(b.participantId)}
              <span class="px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 text-[10px] font-medium text-primary-700 dark:text-primary-300">
                {name}
              </span>
            {/each}
            {#if expense.beneficiaries.length > 4}
              <span class="text-[10px] text-[var(--text-secondary)]">{$t('expenses.more', { count: expense.beneficiaries.length - 4 })}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <button
    onclick={openAdd}
    class="fixed mobile-fab end-4 md:bottom-6 md:end-6 w-14 h-14 rounded-2xl flex items-center justify-center transition-all
      {hasPrerequisites
        ? 'bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 hover:scale-105 text-white shadow-lg shadow-[var(--fab-shadow)] active:scale-90'
        : 'bg-surface-300 dark:bg-surface-700 text-surface-500 dark:text-surface-400 cursor-not-allowed shadow-sm'}"
  >
    <Plus size={24} />
  </button>
</div>

{#if showForm}
  <ExpenseForm
    expense={editingExpense}
    onSave={handleSaved}
    onClose={() => { showForm = false; editingExpense = null; }}
  />
{/if}

<ConfirmDialog
  open={deleteConfirm !== null}
  title={$t('expenses.deleteTitle')}
  message={$t('expenses.deleteMessage')}
  confirmLabel={$t('common.delete')}
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>

{#if viewingImageId}
  <ImageViewer imageId={viewingImageId} onClose={() => viewingImageId = null} />
{/if}
