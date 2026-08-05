<script lang="ts">
  import { Clock, ChevronDown, ChevronUp, X, Pencil, Check, ExternalLink } from '@lucide/svelte';
  import {
    appData,
    applyJournalEntry,
    applyAllPendingJournals,
    deleteJournalEntry
  } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { formatAmount } from '$lib/utils/format';
  import { t } from '$lib/i18n';
  import type { JournalEntry, JournalStatus } from '$lib/types';
  import JournalForm from './JournalForm.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';

  interface Props {
    onViewExpense?: (expenseId: string) => void;
    initialExpanded?: boolean;
  }

  let { onViewExpense, initialExpanded = false }: Props = $props();

  type FilterStatus = 'all' | JournalStatus;

  let expanded = $state(false);
  let filter: FilterStatus = $state('all');
  let editingEntry: JournalEntry | null = $state(null);
  let outOfSyncConfirm: JournalEntry | null = $state(null);
  let deleteConfirm: JournalEntry | null = $state(null);

  $effect(() => {
    if (initialExpanded) expanded = true;
  });

  let actionableCount = $derived(
    $appData.journals.filter(j => j.status === 'pending' || j.status === 'error').length
  );

  let filteredJournals = $derived.by(() => {
    const list = [...$appData.journals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (filter === 'all') return list;
    return list.filter(j => j.status === filter);
  });

  function statusLabel(status: JournalStatus): string {
    return $t(`journals.status.${status}`);
  }

  function statusClass(status: JournalStatus): string {
    switch (status) {
      case 'applied': return 'bg-success-500/10 text-success-600 dark:text-success-400';
      case 'pending': return 'bg-warning-500/10 text-warning-600 dark:text-warning-400';
      case 'error': return 'bg-danger-500/10 text-danger-600 dark:text-danger-400';
      case 'out_of_sync': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
      case 'excluded': return 'bg-surface-500/10 text-[var(--text-secondary)]';
    }
  }

  function handleApply(entry: JournalEntry) {
    if (entry.status === 'excluded') {
      showToast($t('journals.excludedHint'), 'error');
      return;
    }
    if (entry.status === 'out_of_sync') {
      outOfSyncConfirm = entry;
      return;
    }
    doApply(entry.id);
  }

  function doApply(id: string, force = false) {
    const result = applyJournalEntry(id, { force });
    if (result.success) {
      showToast($t('journals.applied'));
    } else if (result.error === 'out_of_sync') {
      outOfSyncConfirm = $appData.journals.find(j => j.id === id) ?? null;
    } else {
      // Validation failures come back as i18n keys; show the message, not the key.
      const message = result.error && result.error.startsWith('validation.')
        ? $t(result.error)
        : result.error;
      showToast(message ?? $t('journals.applyFailed'), 'error');
    }
  }

  function confirmOutOfSyncApply() {
    if (!outOfSyncConfirm) return;
    doApply(outOfSyncConfirm.id, true);
    outOfSyncConfirm = null;
  }

  function handleApplyAll() {
    const result = applyAllPendingJournals();
    if (result.applied > 0) {
      showToast($t('journals.appliedBulk', { count: result.applied }));
    }
    if (result.failed > 0) {
      showToast($t('journals.applyBulkFailed', { count: result.failed }), 'error');
    }
    if (result.applied === 0 && result.failed === 0 && result.excluded > 0) {
      showToast($t('journals.excludedHint'), 'error');
    }
  }

  function handleDelete(entry: JournalEntry) {
    deleteConfirm = entry;
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    deleteJournalEntry(deleteConfirm.id, false);
    deleteConfirm = null;
    showToast($t('journals.deleted'));
  }

  function journalLabel(entry: JournalEntry): string {
    if (entry.journalId) return entry.journalId;
    return entry.description || entry.payerName || '—';
  }
</script>

{#if $appData.journals.length > 0}
  <div class="rounded-2xl border border-warning-200 dark:border-warning-800/50 bg-warning-50 dark:bg-warning-900/20 overflow-hidden">
    <button
      onclick={() => expanded = !expanded}
      class="w-full flex items-center gap-3 p-4"
    >
      <Clock size={18} class="text-warning-600 dark:text-warning-400 shrink-0" />
      <span class="flex-1 text-start text-sm font-medium text-warning-800 dark:text-warning-200">
        {actionableCount > 0
          ? $t('journals.banner', { count: actionableCount })
          : $t('journals.bannerAllApplied', { count: $appData.journals.length })}
      </span>
      {#if expanded}
        <ChevronUp size={16} class="text-warning-600 dark:text-warning-400" />
      {:else}
        <ChevronDown size={16} class="text-warning-600 dark:text-warning-400" />
      {/if}
    </button>

    {#if expanded}
      <div class="border-t border-warning-200 dark:border-warning-800/50 px-4 pb-4">
        <div class="flex flex-wrap gap-2 mt-3 mb-3">
          {#each ['all', 'pending', 'error', 'out_of_sync', 'applied', 'excluded'] as f}
            <button
              onclick={() => filter = f as FilterStatus}
              class="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                {filter === f ? 'bg-primary-600 text-white' : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--card-border)]'}"
            >
              {$t(`journals.filter.${f}`)}
            </button>
          {/each}
        </div>

        <div class="flex gap-2 mb-3">
          <button
            onclick={handleApplyAll}
            class="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-500 transition-colors"
          >
            {$t('journals.applyAll')}
          </button>
        </div>

        <div class="space-y-2 max-h-72 overflow-y-auto">
          {#each filteredJournals as entry (entry.id)}
            <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <p class="text-sm font-medium text-[var(--text-primary)] truncate">{journalLabel(entry)}</p>
                  <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium {statusClass(entry.status)}">
                    {statusLabel(entry.status)}
                  </span>
                </div>
                <p class="text-xs text-[var(--text-secondary)] truncate">
                  {#if entry.skipReason && entry.status !== 'applied'}
                    {entry.skipReason}
                  {:else}
                    {entry.payerName}{entry.payeeName ? ` → ${entry.payeeName}` : ''}
                  {/if}
                  {#if entry.amount} · {formatAmount(entry.amount)} {entry.currencyCode}{/if}
                </p>
              </div>
              <div class="flex gap-1 shrink-0">
                <button
                  onclick={() => editingEntry = entry}
                  class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  title={$t('common.edit')}
                >
                  <Pencil size={12} class="text-primary-600 dark:text-primary-300" />
                </button>
                {#if entry.status === 'pending' || entry.status === 'error' || entry.status === 'out_of_sync'}
                  <button
                    onclick={() => handleApply(entry)}
                    class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-success-500/10 transition-colors"
                    title={$t('journals.apply')}
                  >
                    <Check size={12} class="text-success-600" />
                  </button>
                {/if}
                {#if entry.expenseId && onViewExpense}
                  <button
                    onclick={() => onViewExpense?.(entry.expenseId!)}
                    class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
                    title={$t('journals.viewExpense')}
                  >
                    <ExternalLink size={12} class="text-[var(--text-secondary)]" />
                  </button>
                {/if}
                <button
                  onclick={() => handleDelete(entry)}
                  class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                >
                  <X size={12} class="text-danger-500" />
                </button>
              </div>
            </div>
          {:else}
            <p class="text-xs text-[var(--text-secondary)] text-center py-4">{$t('journals.noFiltered')}</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

{#if editingEntry}
  <JournalForm
    entry={editingEntry}
    onSave={() => { editingEntry = null; showToast($t('journals.saved')); }}
    onClose={() => editingEntry = null}
  />
{/if}

<ConfirmDialog
  open={outOfSyncConfirm !== null}
  title={$t('journals.outOfSyncTitle')}
  message={$t('journals.outOfSyncMessage')}
  confirmLabel={$t('journals.apply')}
  destructive={false}
  onConfirm={confirmOutOfSyncApply}
  onCancel={() => outOfSyncConfirm = null}
/>

<ConfirmDialog
  open={deleteConfirm !== null}
  title={$t('journals.deleteTitle')}
  message={$t('journals.deleteMessage')}
  confirmLabel={$t('common.delete')}
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>
