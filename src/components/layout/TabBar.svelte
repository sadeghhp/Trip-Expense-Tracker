<script lang="ts">
  import { Home, Users, Coins, Receipt, BarChart3, ArrowRightLeft, Settings } from '@lucide/svelte';
  import type { TabId } from '$lib/types';
  import { t } from '$lib/i18n';

  interface Props {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
  }

  let { activeTab, onTabChange }: Props = $props();

  const tabIcons: Record<string, any> = {
    home: Home,
    participants: Users,
    currencies: Coins,
    expenses: Receipt,
    balances: BarChart3,
    settlement: ArrowRightLeft,
    settings: Settings,
  };

  const tabKeys: { id: TabId; labelKey: string }[] = [
    { id: 'home', labelKey: 'tabBar.home' },
    { id: 'participants', labelKey: 'tabBar.people' },
    { id: 'currencies', labelKey: 'tabBar.currency' },
    { id: 'expenses', labelKey: 'tabBar.expenses' },
    { id: 'balances', labelKey: 'tabBar.balances' },
    { id: 'settlement', labelKey: 'tabBar.settle' },
    { id: 'settings', labelKey: 'tabBar.settings' },
  ];

  const mobileTabKeys: { id: TabId; labelKey: string }[] = [
    { id: 'home', labelKey: 'tabBar.home' },
    { id: 'expenses', labelKey: 'tabBar.expenses' },
    { id: 'balances', labelKey: 'tabBar.balances' },
    { id: 'settlement', labelKey: 'tabBar.settle' },
    { id: 'settings', labelKey: 'tabBar.settings' },
  ];
</script>

<!-- Desktop sidebar -->
<nav class="hidden md:flex flex-col w-20 lg:w-56 h-full border-e border-[var(--tab-border)] bg-[var(--tab-bg)] shrink-0">
  <div class="p-4 lg:px-5 lg:py-6">
    <div class="hidden lg:block text-xl font-bold tracking-tight bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">{$t('tabBar.brand')}</div>
    <div class="lg:hidden text-center text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">{$t('tabBar.brandShort')}</div>
  </div>
  <div class="flex flex-col gap-1 px-2 lg:px-3 flex-1">
    {#each tabKeys as tab}
      {@const Icon = tabIcons[tab.id]}
      <button
        onclick={() => onTabChange(tab.id)}
        class="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
          {activeTab === tab.id
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm'
            : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
      >
        {#if activeTab === tab.id}
          <div class="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-e-full bg-primary-500 dark:bg-primary-400"></div>
        {/if}
        <Icon size={20} strokeWidth={activeTab === tab.id ? 2.2 : 1.8} />
        <span class="hidden lg:inline">{$t(tab.labelKey)}</span>
        <span class="lg:hidden absolute start-full ms-2 px-2.5 py-1.5 rounded-lg bg-[#0f172a] dark:bg-[#f1f5f9] text-white dark:text-[#0f172a] text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 shadow-lg z-50">
          {$t(tab.labelKey)}
        </span>
      </button>
    {/each}
  </div>
  <div class="px-3 lg:px-4 py-4 border-t border-[var(--tab-border)]">
    <div class="text-[10px] text-center lg:text-start text-[var(--text-secondary)] opacity-60">
      {$t('tabBar.version')}
    </div>
  </div>
</nav>

<!-- Mobile bottom tab bar -->
<nav class="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--tab-bg)]/95 backdrop-blur-lg border-t border-[var(--tab-border)] safe-area-bottom">
  <div class="flex justify-around items-center h-16 px-1">
    {#each mobileTabKeys as tab}
      {@const Icon = tabIcons[tab.id]}
      <button
        onclick={() => onTabChange(tab.id)}
        class="relative flex flex-col items-center justify-center gap-0.5 w-full h-full rounded-lg transition-all duration-200 active:scale-90
          {activeTab === tab.id
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-[var(--text-secondary)]'}"
      >
        {#if activeTab === tab.id}
          <div class="absolute top-0 start-1/2 -translate-x-1/2 w-8 h-1 rounded-b-full bg-gradient-to-r from-primary-500 to-primary-400"></div>
        {/if}
        <Icon size={20} strokeWidth={activeTab === tab.id ? 2.2 : 1.8} />
        <span class="text-[10px] font-medium">{$t(tab.labelKey)}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
</style>
