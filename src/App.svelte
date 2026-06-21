<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { TabId } from '$lib/types';
  import { showToast } from '$lib/stores/toast';
  import TabBar from './components/layout/TabBar.svelte';
  import Header from './components/layout/Header.svelte';
  import Toast from './components/ui/Toast.svelte';
  import Participants from './components/participants/Participants.svelte';
  import Currencies from './components/currencies/Currencies.svelte';
  import Expenses from './components/expenses/Expenses.svelte';
  import Balances from './components/balances/Balances.svelte';
  import Settlement from './components/settlement/Settlement.svelte';
  import SettingsTab from './components/settings/Settings.svelte';

  let activeTab: TabId = $state('expenses');

  const tabTitles: Record<TabId, string> = {
    participants: 'Participants',
    currencies: 'Currencies',
    expenses: 'Expenses',
    balances: 'Balances',
    settlement: 'Settlement',
    settings: 'Settings'
  };

  function handleTabChange(tab: TabId) {
    activeTab = tab;
  }
</script>

<div class="flex h-full">
  <TabBar {activeTab} onTabChange={handleTabChange} />

  <main class="flex-1 flex flex-col h-full overflow-hidden">
    <Header title={tabTitles[activeTab]} />

    <div class="flex-1 overflow-y-auto pb-20 md:pb-4">
      {#key activeTab}
        <div in:fly={{ x: 10, duration: 200, delay: 50 }} out:fly={{ x: -10, duration: 150 }}>
          {#if activeTab === 'participants'}
            <Participants {showToast} />
          {:else if activeTab === 'currencies'}
            <Currencies {showToast} />
          {:else if activeTab === 'expenses'}
            <Expenses {showToast} />
          {:else if activeTab === 'balances'}
            <Balances />
          {:else if activeTab === 'settlement'}
            <Settlement {showToast} />
          {:else if activeTab === 'settings'}
            <SettingsTab {showToast} />
          {/if}
        </div>
      {/key}
    </div>
  </main>
</div>

<Toast />
