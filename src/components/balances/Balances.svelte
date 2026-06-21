<script lang="ts">
  import { BarChart3, ChevronDown } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { appData } from '$lib/stores/data';
  import { computeBalances, getStatus } from '$lib/engine/balances';
  import { formatAmount, getParticipantName, getCurrencySymbol } from '$lib/utils/format';
  import { t } from '$lib/i18n';
  import EmptyState from '../layout/EmptyState.svelte';

  let balances = $derived(computeBalances($appData.expenses));
  let currencyCodes = $derived(Object.keys(balances));

  let collapsed: Record<string, boolean> = $state({});

  function toggleCurrency(code: string) {
    collapsed[code] = !collapsed[code];
  }

  function nameFor(id: string): string {
    return getParticipantName(id, $appData.participants);
  }

  function symbolFor(code: string): string {
    return getCurrencySymbol(code, $appData.currencies);
  }

  function getStatusColor(status: string): string {
    if (status === 'creditor') return 'text-success-600 dark:text-success-500';
    if (status === 'debtor') return 'text-danger-500';
    return 'text-[var(--text-secondary)]';
  }

  function getStatusBg(status: string): string {
    if (status === 'creditor') return 'bg-success-100 dark:bg-success-500/10';
    if (status === 'debtor') return 'bg-danger-100 dark:bg-danger-500/10';
    return 'bg-[#e2e8f0] dark:bg-[#334155]';
  }
</script>

<div class="p-4 md:p-6 space-y-6">
  {#if currencyCodes.length === 0}
    <EmptyState
      icon={BarChart3}
      title={$t('balances.noBalancesTitle')}
      description={$t('balances.noBalancesDesc')}
    />
  {:else}
    {#each currencyCodes as code (code)}
      {@const symbol = symbolFor(code)}
      {@const entries = Object.entries(balances[code]).filter(([_, e]) => e.paid > 0 || e.owed > 0)}
      <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
        <button
          type="button"
          class="w-full px-4 py-3 border-b border-[var(--card-border)] bg-primary-50/50 dark:bg-primary-900/20 cursor-pointer"
          onclick={() => toggleCurrency(code)}
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg font-bold text-primary-700 dark:text-primary-300">{symbol}</span>
              <span class="text-sm font-semibold text-[var(--text-primary)]">{code}</span>
              <span class="text-xs text-[var(--text-secondary)]">({entries.length})</span>
            </div>
            <ChevronDown
              size={18}
              class="text-[var(--text-secondary)] transition-transform duration-300 {collapsed[code] ? '-rotate-90' : ''}"
            />
          </div>
        </button>

        {#if !collapsed[code]}
          <div transition:slide={{ duration: 250 }}>
            <div class="divide-y divide-[var(--card-border)]">
              {#each entries as [pid, entry] (pid)}
                {@const status = getStatus(entry.net)}
                {@const name = nameFor(pid)}
                {@const maxVal = Math.max(entry.paid, entry.owed) || 1}
                <div class="px-4 py-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-[var(--text-primary)]">{name}</span>
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase {getStatusBg(status)} {getStatusColor(status)}">
                      {$t(`balances.${status}`)}
                    </span>
                  </div>

                    <div class="space-y-1.5">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] w-10 text-[var(--text-secondary)] uppercase tracking-wide">{$t('balances.paid')}</span>
                      <div class="flex-1 h-5 rounded-full bg-[#e2e8f0] dark:bg-[#1e293b] overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500" style="width: {(entry.paid / maxVal) * 100}%"></div>
                      </div>
                      <span class="text-xs font-semibold text-[var(--text-primary)] w-20 text-end">{symbol}{formatAmount(entry.paid)}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] w-10 text-[var(--text-secondary)] uppercase tracking-wide">{$t('balances.owed')}</span>
                      <div class="flex-1 h-5 rounded-full bg-[#e2e8f0] dark:bg-[#1e293b] overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r from-danger-400/60 to-danger-600/60 transition-all duration-500" style="width: {(entry.owed / maxVal) * 100}%"></div>
                      </div>
                      <span class="text-xs font-semibold text-[var(--text-primary)] w-20 text-end">{symbol}{formatAmount(entry.owed)}</span>
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
        {/if}
      </div>
    {/each}
  {/if}
</div>
