<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Plus, MapPin, Pencil, Trash2, Users, Receipt, Coins, Copy, Archive, ArchiveRestore, Search, ArrowUpDown, X } from '@lucide/svelte';
  import { trips, switchTrip, deleteTrip, duplicateTrip, archiveTrip, unarchiveTrip } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import type { Trip } from '$lib/types';
  import EmptyState from '../layout/EmptyState.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import TripForm from './TripForm.svelte';

  type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'updated';

  let showForm = $state(false);
  let editingTrip: Trip | null = $state(null);
  let deleteConfirm: Trip | null = $state(null);
  let showArchived = $state(false);
  let sortBy: SortOption = $state('newest');
  let searchQuery = $state('');
  let showSortMenu = $state(false);

  let deleteMessage = $derived(
    'Are you sure you want to delete "' + (deleteConfirm?.name ?? '') + '" and all its data? This cannot be undone.'
  );

  function getExpenseSummary(trip: Trip): string {
    if (trip.data.expenses.length === 0) return '';
    const totals: Record<string, number> = {};
    for (const exp of trip.data.expenses) {
      totals[exp.currencyCode] = (totals[exp.currencyCode] ?? 0) + exp.amount;
    }
    const currencyMap = new Map(trip.data.currencies.map(c => [c.code, c.symbol]));
    return Object.entries(totals)
      .map(([code, amount]) => {
        const symbol = currencyMap.get(code) ?? code;
        return symbol + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      })
      .join(' + ');
  }

  let filteredTrips = $derived.by(() => {
    let list = $trips.filter(t => showArchived ? t.archived : !t.archived);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.data.participants.some(p => p.name.toLowerCase().includes(q)) ||
        t.data.expenses.some(e => e.description.toLowerCase().includes(q))
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case 'newest': sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
      case 'oldest': sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); break;
      case 'name-asc': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': sorted.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'updated': sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); break;
    }
    return sorted;
  });

  let activeCount = $derived($trips.filter(t => !t.archived).length);
  let archivedCount = $derived($trips.filter(t => t.archived).length);

  const sortLabels: Record<SortOption, string> = {
    'newest': 'Newest first',
    'oldest': 'Oldest first',
    'name-asc': 'Name A–Z',
    'name-desc': 'Name Z–A',
    'updated': 'Last updated'
  };

  function openCreate() {
    editingTrip = null;
    showForm = true;
  }

  function openEdit(trip: Trip, e: Event) {
    e.stopPropagation();
    editingTrip = trip;
    showForm = true;
  }

  function requestDelete(trip: Trip, e: Event) {
    e.stopPropagation();
    deleteConfirm = trip;
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    deleteTrip(deleteConfirm.id);
    showToast('Trip deleted');
    deleteConfirm = null;
  }

  function handleDuplicate(trip: Trip, e: Event) {
    e.stopPropagation();
    duplicateTrip(trip.id);
    showToast('Trip duplicated');
  }

  function handleArchive(trip: Trip, e: Event) {
    e.stopPropagation();
    archiveTrip(trip.id);
    showToast('Trip archived');
  }

  function handleUnarchive(trip: Trip, e: Event) {
    e.stopPropagation();
    unarchiveTrip(trip.id);
    showToast('Trip restored');
  }

  function handleTripClick(trip: Trip) {
    if (trip.archived) return;
    switchTrip(trip.id);
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  }
</script>

<div class="h-full flex flex-col">
  <header class="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 h-14 bg-[var(--header-bg)] backdrop-blur-xl border-b border-[var(--header-border)]">
    <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">TripExpense</h1>
    <div class="h-1 absolute bottom-0 left-0 right-0 bg-gradient-to-r from-primary-500/0 via-primary-500/20 to-primary-500/0"></div>
  </header>

  <div class="flex-1 overflow-y-auto pb-20 md:pb-4">
    <div class="max-w-3xl mx-auto p-4 md:p-6">
      {#if $trips.length === 0}
        <EmptyState
          icon={MapPin}
          title="No trips yet"
          description="Create your first trip to start tracking shared expenses."
        >
          <button
            onclick={openCreate}
            class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-medium transition-all hover:shadow-md active:scale-95"
          >
            Create First Trip
          </button>
        </EmptyState>
      {:else}
        <!-- Search + Controls -->
        <div class="space-y-3 mb-4">
          <!-- Search bar -->
          <div class="relative">
            <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search trips, expenses, people..."
              class="w-full pl-9 pr-9 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
            />
            {#if searchQuery}
              <button onclick={() => searchQuery = ''} class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X size={14} />
              </button>
            {/if}
          </div>

          <!-- Sort + Archive toggle -->
          <div class="flex items-center justify-between gap-2">
            <div class="relative">
              <button
                onclick={() => showSortMenu = !showSortMenu}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--card-bg)] border border-[var(--card-border)] transition-colors"
              >
                <ArrowUpDown size={12} />
                {sortLabels[sortBy]}
              </button>
              {#if showSortMenu}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="fixed inset-0 z-40" onclick={() => showSortMenu = false}></div>
                <div class="absolute top-full left-0 mt-1 z-50 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg overflow-hidden min-w-[150px]">
                  {#each Object.entries(sortLabels) as [key, label]}
                    <button
                      onclick={() => { sortBy = key as SortOption; showSortMenu = false; }}
                      class="w-full text-left px-3 py-2 text-xs font-medium transition-colors
                        {sortBy === key ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-[var(--text-secondary)] hover:bg-surface-50 dark:hover:bg-surface-800'}"
                    >
                      {label}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            {#if archivedCount > 0}
              <button
                onclick={() => showArchived = !showArchived}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  {showArchived ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 border border-primary-200 dark:border-primary-800' : 'text-[var(--text-secondary)] hover:bg-[var(--card-bg)] border border-[var(--card-border)]'}"
              >
                <Archive size={12} />
                Archived ({archivedCount})
              </button>
            {/if}
          </div>
        </div>

        <!-- Trip grid -->
        {#if filteredTrips.length === 0}
          <div class="text-center py-12 text-sm text-[var(--text-secondary)]">
            {#if searchQuery}
              No trips match your search.
            {:else if showArchived}
              No archived trips.
            {:else}
              No active trips.
            {/if}
          </div>
        {:else}
          <div class="grid gap-3 sm:grid-cols-2">
            {#each filteredTrips as trip, i (trip.id)}
              {@const summary = getExpenseSummary(trip)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                onclick={() => handleTripClick(trip)}
                class="text-left w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group
                  {trip.archived ? 'opacity-60' : 'cursor-pointer hover:border-primary-200 dark:hover:border-primary-800'}"
                in:fly={{ y: 15, duration: 250, delay: Math.min(i * 50, 500) }}
              >
                <div class="p-4 space-y-3">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0
                        {trip.archived ? 'opacity-50' : ''}">
                        <MapPin size={20} class="text-primary-600 dark:text-primary-400" />
                      </div>
                      <div class="min-w-0">
                        <h3 class="text-base font-semibold text-[var(--text-primary)] truncate">{trip.name}</h3>
                        {#if trip.description}
                          <p class="text-xs text-[var(--text-secondary)] truncate">{trip.description}</p>
                        {/if}
                      </div>
                    </div>
                    <div class="flex gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {#if trip.archived}
                        <button
                          onclick={(e) => handleUnarchive(trip, e)}
                          class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
                          title="Unarchive"
                        >
                          <ArchiveRestore size={14} class="text-primary-500" />
                        </button>
                      {:else}
                        <button
                          onclick={(e) => handleDuplicate(trip, e)}
                          class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
                          title="Duplicate"
                        >
                          <Copy size={14} class="text-[var(--text-secondary)]" />
                        </button>
                        <button
                          onclick={(e) => openEdit(trip, e)}
                          class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
                          title="Edit"
                        >
                          <Pencil size={14} class="text-[var(--text-secondary)]" />
                        </button>
                        <button
                          onclick={(e) => handleArchive(trip, e)}
                          class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
                          title="Archive"
                        >
                          <Archive size={14} class="text-[var(--text-secondary)]" />
                        </button>
                      {/if}
                      <button
                        onclick={(e) => requestDelete(trip, e)}
                        class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-danger-500/10 active:scale-90 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={14} class="text-danger-500" />
                      </button>
                    </div>
                  </div>

                  <div class="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                    <span class="flex items-center gap-1">
                      <Users size={12} />
                      {trip.data.participants.length}
                    </span>
                    <span class="flex items-center gap-1">
                      <Receipt size={12} />
                      {trip.data.expenses.length}
                    </span>
                    <span class="flex items-center gap-1">
                      <Coins size={12} />
                      {trip.data.currencies.length}
                    </span>
                  </div>

                  {#if summary}
                    <div class="text-xs font-medium text-primary-600 dark:text-primary-400 truncate">
                      {summary}
                    </div>
                  {/if}

                  <div class="text-[10px] text-[var(--text-secondary)] opacity-60">
                    Created {formatDate(trip.createdAt)}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>

  {#if $trips.length > 0}
    <button
      onclick={openCreate}
      class="fixed bottom-4 right-4 md:bottom-6 md:right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 hover:scale-105 text-white shadow-lg shadow-[var(--fab-shadow)] flex items-center justify-center transition-all active:scale-90 z-50"
    >
      <Plus size={24} />
    </button>
  {/if}
</div>

<TripForm
  open={showForm}
  trip={editingTrip}
  onClose={() => { showForm = false; editingTrip = null; }}
/>

<ConfirmDialog
  open={deleteConfirm !== null}
  title="Delete Trip"
  message={deleteMessage}
  confirmLabel="Delete"
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>
