<script lang="ts">
  import { Users, Coins, Receipt, BarChart3, ArrowRightLeft, Settings } from '@lucide/svelte';
  import type { TabId } from '$lib/types';

  interface Props {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
  }

  let { activeTab, onTabChange }: Props = $props();

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'participants', label: 'People', icon: Users },
    { id: 'currencies', label: 'Currency', icon: Coins },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'balances', label: 'Balances', icon: BarChart3 },
    { id: 'settlement', label: 'Settle', icon: ArrowRightLeft },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];
</script>

<!-- Desktop sidebar -->
<nav class="hidden md:flex flex-col w-20 lg:w-56 h-full border-r border-[var(--tab-border)] bg-[var(--tab-bg)] shrink-0">
  <div class="p-4 lg:px-5 lg:py-6">
    <div class="hidden lg:block text-lg font-bold text-primary-600 dark:text-primary-400">TripExpense</div>
    <div class="lg:hidden text-center text-lg font-bold text-primary-600 dark:text-primary-400">TE</div>
  </div>
  <div class="flex flex-col gap-1 px-2 lg:px-3 flex-1">
    {#each tabs as tab}
      <button
        onclick={() => onTabChange(tab.id)}
        class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
          {activeTab === tab.id
            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 shadow-sm'
            : 'text-[var(--text-secondary)] hover:bg-surface-100 dark:hover:bg-surface-800'}"
      >
        <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.2 : 1.8} />
        <span class="hidden lg:inline">{tab.label}</span>
      </button>
    {/each}
  </div>
</nav>

<!-- Mobile bottom tab bar -->
<nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--tab-bg)] border-t border-[var(--tab-border)] safe-area-bottom">
  <div class="flex justify-around items-center h-16 px-1">
    {#each tabs as tab}
      <button
        onclick={() => onTabChange(tab.id)}
        class="flex flex-col items-center justify-center gap-0.5 w-full h-full rounded-lg transition-all duration-200 active:scale-90
          {activeTab === tab.id
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-[var(--text-secondary)]'}"
      >
        <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.2 : 1.8} />
        <span class="text-[10px] font-medium">{tab.label}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
</style>
