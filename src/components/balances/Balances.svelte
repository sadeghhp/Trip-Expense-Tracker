<script lang="ts">
  import { BarChart3 } from '@lucide/svelte';
  import { appData } from '$lib/stores/data';
  import { computeBalances, getStatus } from '$lib/engine/balances';
  import { formatAmount } from '$lib/utils/format';
  import EmptyState from '../layout/EmptyState.svelte';

  let balances = $derived(computeBalances($appData.expenses));
  let currencyCodes = $derived(Object.keys(balances));

  function getParticipantName(id: string): string {
    return $appData.participants.find(p => p.id === id)?.name ?? 'Unknown';
  }

  function getCurrencySymbol(code: string): string {
    return $appData.currencies.find(c => c.code === code)?.symbol ?? '';
  }

  function getStatusColor(status: string): string {
    if (status === 'creditor') return 'text-success-600 dark:text-success-500';
    if (status === 'debtor') return 'text-danger-500';
    return 'text-[var(--text-secondary)]';
  }

  function getStatusBg(status: string): string {
    if (status === 'creditor') return 'bg-success-500/10';
    if (status === 'debtor') return 'bg-danger-500/10';
    return 'bg-surface-100 dark:bg-surface-800';
  }
</script>

<div class="p-4 md:p-6 space-y-6">
  {#if currencyCodes.length === 0}
    <EmptyState
      icon={BarChart3}
      title="No balances yet"
      description="Add expenses to see balance breakdowns per currency."
    />
  {:else}
    {#each currencyCodes as code (code)}
      {@const symbol = getCurrencySymbol(code)}
      {@const entries = Object.entries(balances[code]).filter(([_, e]) => e.paid > 0 || e.owed > 0)}
      <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-[var(--card-border)] bg-surface-50 dark:bg-surface-900">
          <div class="flex items-center gap-2">
            <span class="text-lg font-bold">{symbol}</span>
            <span class="text-sm font-semibold text-[var(--text-primary)]">{code}</span>
          </div>
        </div>

        <div class="divide-y divide-[var(--card-border)]">
          {#each entries as [pid, entry] (pid)}
            {@const status = getStatus(entry.net)}
            {@const name = getParticipantName(pid)}
            {@const maxVal = Math.max(entry.paid, entry.owed) || 1}
            <div class="px-4 py-3 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-[var(--text-primary)]">{name}</span>
                <span class="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase {getStatusBg(status)} {getStatusColor(status)}">
                  {status}
                </span>
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] w-10 text-[var(--text-secondary)] uppercase tracking-wide">Paid</span>
                  <div class="flex-1 h-5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500" style="width: {(entry.paid / maxVal) * 100}%"></div>
                  </div>
                  <span class="text-xs font-semibold text-[var(--text-primary)] w-20 text-right">{symbol}{formatAmount(entry.paid)}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] w-10 text-[var(--text-secondary)] uppercase tracking-wide">Owed</span>
                  <div class="flex-1 h-5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-danger-400/60 to-danger-600/60 transition-all duration-500" style="width: {(entry.owed / maxVal) * 100}%"></div>
                  </div>
                  <span class="text-xs font-semibold text-[var(--text-primary)] w-20 text-right">{symbol}{formatAmount(entry.owed)}</span>
                </div>
              </div>

              <div class="flex justify-end">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold {getStatusBg(status)} {getStatusColor(status)}">
                  Net: {entry.net < 0 ? '-' : '+'}{symbol}{formatAmount(Math.abs(entry.net))}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>
