<script lang="ts">
  import { BookOpen } from '@lucide/svelte';
  import { appData } from '$lib/stores/data';
  import { formatAmount } from '$lib/utils/format';
  import { t } from '$lib/i18n';
  import type { JournalEntry } from '$lib/types';
  import EmptyState from '../layout/EmptyState.svelte';

  interface Props {
    onViewExpense?: (expenseId: string) => void;
  }

  let { onViewExpense }: Props = $props();

  let filter = $state<'all' | 'imported' | 'skipped'>('all');
  let typeFilter = $state('');
  let currencyFilter = $state('');
  let payerFilter = $state('');

  let entries = $derived($appData.journalEntries ?? []);

  let entryTypes = $derived(
    [...new Set(entries.map(e => e.entryType).filter(Boolean))].sort()
  );

  let entryCurrencies = $derived(
    [...new Set(entries.map(e => e.currency).filter(Boolean))].sort()
  );

  let entryPayers = $derived(
    [...new Set(entries.map(e => e.payer).filter(Boolean))].sort()
  );

  let filtered = $derived(
    entries.filter(e => {
      if (filter === 'imported' && e.status === 'skipped') return false;
      if (filter === 'skipped' && e.status !== 'skipped') return false;
      if (typeFilter && e.entryType !== typeFilter) return false;
      if (currencyFilter && e.currency !== currencyFilter) return false;
      if (payerFilter && e.payer !== payerFilter) return false;
      return true;
    })
  );

  function statusColor(status: JournalEntry['status']): string {
    if (status === 'imported') return 'bg-green-500';
    if (status === 'flagged') return 'bg-amber-500';
    return 'bg-gray-400';
  }

  function rowBg(status: JournalEntry['status']): string {
    if (status === 'imported') return 'bg-green-50/50 dark:bg-green-900/5';
    if (status === 'flagged') return 'bg-amber-50/50 dark:bg-amber-900/5';
    return 'bg-[#f8fafc] dark:bg-[#1e293b]/50';
  }
</script>

{#if entries.length === 0}
  <EmptyState
    icon={BookOpen}
    title={$t('journal.noEntriesTitle')}
    description={$t('journal.noEntriesDesc')}
  />
{:else}
  <div class="space-y-3">
    <div class="flex flex-wrap gap-1.5">
      {#each ['all', 'imported', 'skipped'] as f}
        <button
          onclick={() => { filter = f as typeof filter; }}
          class="px-2.5 py-1 rounded-full text-xs font-medium transition-all
            {filter === f ? 'bg-primary-600 text-white' : 'bg-[#e2e8f0] dark:bg-[#334155] text-[var(--text-secondary)]'}"
        >
          {$t(`csvImport.journalFilter.${f}`)}
          ({f === 'all' ? entries.length
            : f === 'imported' ? entries.filter(e => e.status !== 'skipped').length
            : entries.filter(e => e.status === 'skipped').length})
        </button>
      {/each}
    </div>

    {#if entryTypes.length > 1 || entryCurrencies.length > 1 || entryPayers.length > 1}
      <div class="flex flex-wrap gap-2">
        {#if entryTypes.length > 1}
          <select
            bind:value={typeFilter}
            class="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="">{$t('journal.allTypes')}</option>
            {#each entryTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        {/if}
        {#if entryCurrencies.length > 1}
          <select
            bind:value={currencyFilter}
            class="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="">{$t('journal.allCurrencies')}</option>
            {#each entryCurrencies as cur}
              <option value={cur}>{cur}</option>
            {/each}
          </select>
        {/if}
        {#if entryPayers.length > 1}
          <select
            bind:value={payerFilter}
            class="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="">{$t('journal.allPeople')}</option>
            {#each entryPayers as payer}
              <option value={payer}>{payer}</option>
            {/each}
          </select>
        {/if}
      </div>
    {/if}

    <div class="overflow-x-auto rounded-xl border border-[var(--card-border)]">
      <table class="w-full text-xs">
        <thead>
          <tr class="bg-[#f1f5f9] dark:bg-[#1e293b]">
            <th class="px-2 py-2 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap w-4"></th>
            <th class="px-2 py-2 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap">{$t('csvImport.journalCol.id')}</th>
            <th class="px-2 py-2 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap">{$t('csvImport.journalCol.type')}</th>
            <th class="px-2 py-2 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap">{$t('csvImport.journalCol.date')}</th>
            <th class="px-2 py-2 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap">{$t('csvImport.journalCol.payer')}</th>
            <th class="px-2 py-2 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap">{$t('csvImport.journalCol.payee')}</th>
            <th class="px-2 py-2 text-end font-medium text-[var(--text-secondary)] whitespace-nowrap">{$t('csvImport.journalCol.amount')}</th>
            <th class="px-2 py-2 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap">{$t('csvImport.journalCol.description')}</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as entry (entry.journalId)}
            <tr class="border-t border-[var(--card-border)] {rowBg(entry.status)}">
              <td class="px-2 py-2">
                <span class="inline-block w-1.5 h-1.5 rounded-full {statusColor(entry.status)}"></span>
              </td>
              <td class="px-2 py-2 font-mono text-[var(--text-secondary)] whitespace-nowrap">{entry.journalId}</td>
              <td class="px-2 py-2 text-[var(--text-primary)] whitespace-nowrap">{entry.entryType}</td>
              <td class="px-2 py-2 text-[var(--text-primary)] whitespace-nowrap">{entry.date}</td>
              <td class="px-2 py-2 text-[var(--text-primary)] whitespace-nowrap">{entry.payer}</td>
              <td class="px-2 py-2 text-[var(--text-primary)] whitespace-nowrap max-w-[80px] truncate" title={entry.payee}>{entry.payee}</td>
              <td class="px-2 py-2 text-end font-mono text-[var(--text-primary)] whitespace-nowrap">
                {entry.amount > 0 ? `${formatAmount(entry.amount)} ${entry.currency}` : ''}
              </td>
              <td class="px-2 py-2 text-[var(--text-secondary)] max-w-[140px]">
                <div class="truncate" title={entry.description || entry.localNotes}>
                  {entry.description || entry.localNotes}
                </div>
                {#if entry.skipReason}
                  <div class="text-[10px] text-[var(--text-secondary)] opacity-70 truncate" title={entry.skipReason}>
                    {entry.skipReason}
                  </div>
                {/if}
                {#if entry.linkedExpenseId && onViewExpense}
                  <button
                    type="button"
                    onclick={() => onViewExpense(entry.linkedExpenseId!)}
                    class="text-[10px] text-primary-600 dark:text-primary-400 hover:underline mt-0.5"
                  >
                    {$t('journal.viewExpense')}
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="text-[10px] text-[var(--text-secondary)] text-center">
      {$t('journal.entryCount', { count: filtered.length, total: entries.length })}
    </p>
  </div>
{/if}
