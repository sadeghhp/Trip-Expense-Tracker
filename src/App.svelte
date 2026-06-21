<script lang="ts">
  import { fly } from 'svelte/transition';
  import { tick, onMount } from 'svelte';
  import type { TabId } from '$lib/types';
  import { activeTripId, activeTrip, exitTrip, switchTrip, trips, appData } from '$lib/stores/data';
  import { t, dir } from '$lib/i18n';
  import TabBar from './components/layout/TabBar.svelte';
  import Header from './components/layout/Header.svelte';
  import Toast from './components/ui/Toast.svelte';
  import TripList from './components/trips/TripList.svelte';
  import HomeDashboard from './components/home/HomeDashboard.svelte';
  import Participants from './components/participants/Participants.svelte';
  import Currencies from './components/currencies/Currencies.svelte';
  import Expenses from './components/expenses/Expenses.svelte';
  import Balances from './components/balances/Balances.svelte';
  import Settlement from './components/settlement/Settlement.svelte';
  import SettingsTab from './components/settings/Settings.svelte';
  import SetupWizard from './components/home/SetupWizard.svelte';

  let wizardPending = $state(false);

  let needsSetup = $derived.by(() => {
    if (!$activeTripId) return false;
    const missingPrereqs =
      $appData.participants.length === 0 || $appData.currencies.length === 0;
    if (missingPrereqs) return true;
    return wizardPending;
  });

  function completeWizard() {
    wizardPending = false;
  }

  let activeTab: TabId = $state('home');
  let suppressHashUpdate = false;
  let hashChangeVersion = 0;
  let hashNavPending = false;
  let hashNavRunning = false;
  let previousTripId: string | null | undefined = undefined;

  const validTabs = new Set<string>(['home', 'participants', 'currencies', 'expenses', 'balances', 'settlement', 'settings']);

  let flyInX = $derived($dir === 'rtl' ? -20 : 20);
  let flyOutX = $derived($dir === 'rtl' ? 20 : -20);

  function parseHash(): { tripId: string | null; tab: TabId | null } {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return { tripId: null, tab: null };
    const parts = hash.split('/');
    if (parts[0] === 'trip' && parts[1]) {
      const tab = parts[2] && validTabs.has(parts[2]) ? parts[2] as TabId : null;
      return { tripId: parts[1], tab };
    }
    return { tripId: null, tab: null };
  }

  function updateHash() {
    if (suppressHashUpdate) return;
    const tripId = $activeTripId;
    if (tripId) {
      const newHash = `#/trip/${tripId}/${activeTab}`;
      if (window.location.hash !== newHash) {
        window.history.pushState(null, '', newHash);
      }
    } else {
      if (window.location.hash && window.location.hash !== '#/') {
        window.history.pushState(null, '', '#/');
      }
    }
  }

  async function handleHashChange() {
    hashNavPending = true;
    if (hashNavRunning) return;
    hashNavRunning = true;

    while (hashNavPending) {
      hashNavPending = false;
      const version = ++hashChangeVersion;
      const { tripId, tab } = parseHash();
      suppressHashUpdate = true;
      if (tripId) {
        const tripExists = $trips.some(trip => trip.id === tripId);
        if (tripExists) {
          if ($activeTripId !== tripId) {
            switchTrip(tripId);
            activeTab = tab || 'home';
          } else if (tab) {
            activeTab = tab;
          }
        } else {
          exitTrip();
          activeTab = 'home';
        }
      } else {
        if ($activeTripId) {
          exitTrip();
          activeTab = 'home';
        }
      }
      await tick();
      if (version === hashChangeVersion) {
        suppressHashUpdate = false;
      }
    }

    hashNavRunning = false;
  }

  onMount(() => {
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  });

  $effect(() => {
    const tripId = $activeTripId;
    if (previousTripId !== undefined && tripId !== previousTripId && !suppressHashUpdate) {
      activeTab = 'home';
    }
    if (tripId && tripId !== previousTripId) {
      const missingPrereqs =
        $appData.participants.length === 0 || $appData.currencies.length === 0;
      wizardPending = missingPrereqs;
    }
    if (!tripId) {
      wizardPending = false;
    }
    previousTripId = tripId;
  });

  $effect(() => {
    $activeTripId;
    activeTab;
    updateHash();
  });

  function handleTabChange(tab: TabId) {
    activeTab = tab;
  }

  function handleBack() {
    activeTab = 'home';
  }
</script>

{#if !$activeTripId}
  <TripList />
{:else if needsSetup}
  <!-- Force setup: block all navigation until people + currencies are defined -->
  <div class="h-full flex flex-col overflow-y-auto">
    <div class="max-w-lg mx-auto w-full px-4 py-8 md:py-12 flex-1 flex flex-col justify-center">
      <SetupWizard onComplete={completeWizard} />
    </div>
  </div>
{:else}
  <div class="flex h-full">
    <TabBar {activeTab} onTabChange={handleTabChange} />

    <main class="flex-1 flex flex-col h-full overflow-hidden">
      {#if activeTab !== 'home'}
        <Header
          title={$t(`tabs.${activeTab}`)}
          subtitle={$activeTrip?.name}
          onBack={handleBack}
        />
      {/if}

      <div class="flex-1 overflow-y-auto pb-20 md:pb-4">
        <div class="{activeTab === 'home' ? 'max-w-2xl mx-auto' : 'max-w-3xl mx-auto'}">
          {#key activeTab}
            <div in:fly={{ x: flyInX, duration: 250, delay: 60 }} out:fly={{ x: flyOutX, duration: 180 }}>
              {#if activeTab === 'home'}
                <HomeDashboard onNavigate={handleTabChange} />
              {:else if activeTab === 'participants'}
                <Participants />
              {:else if activeTab === 'currencies'}
                <Currencies />
              {:else if activeTab === 'expenses'}
                <Expenses onNavigate={handleTabChange} />
              {:else if activeTab === 'balances'}
                <Balances />
              {:else if activeTab === 'settlement'}
                <Settlement />
              {:else if activeTab === 'settings'}
                <SettingsTab />
              {/if}
            </div>
          {/key}
        </div>
      </div>
    </main>
  </div>
{/if}

<Toast />
