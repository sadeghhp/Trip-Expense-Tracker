<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Plus, MapPin, Pencil, Trash2, Users, Receipt, Coins } from '@lucide/svelte';
  import { trips, switchTrip, deleteTrip } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import type { Trip } from '$lib/types';
  import EmptyState from '../layout/EmptyState.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import TripForm from './TripForm.svelte';

  let showForm = $state(false);
  let editingTrip: Trip | null = $state(null);
  let deleteConfirm: Trip | null = $state(null);

  let deleteMessage = $derived(
    'Are you sure you want to delete "' + (deleteConfirm?.name ?? '') + '" and all its data? This cannot be undone.'
  );

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

  function handleTripClick(trip: Trip) {
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
  <header class="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 h-14 bg-[var(--header-bg)] backdrop-blur-xl border-b border-[var(--header-border)] shadow-sm">
    <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">TripExpense</h1>
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
        <div class="grid gap-3 sm:grid-cols-2">
          {#each $trips as trip, i (trip.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={() => handleTripClick(trip)}
              class="cursor-pointer text-left w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 overflow-hidden group"
              in:fly={{ y: 15, duration: 250, delay: i * 50 }}
            >
              <div class="p-4 space-y-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0">
                      <MapPin size={20} class="text-primary-600 dark:text-primary-400" />
                    </div>
                    <div class="min-w-0">
                      <h3 class="text-base font-semibold text-[var(--text-primary)] truncate">{trip.name}</h3>
                      {#if trip.description}
                        <p class="text-xs text-[var(--text-secondary)] truncate">{trip.description}</p>
                      {/if}
                    </div>
                  </div>
                  <div class="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onclick={(e) => openEdit(trip, e)}
                      class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
                    >
                      <Pencil size={14} class="text-[var(--text-secondary)]" />
                    </button>
                    <button
                      onclick={(e) => requestDelete(trip, e)}
                      class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-danger-500/10 active:scale-90 transition-all"
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

                <div class="text-[10px] text-[var(--text-secondary)] opacity-60">
                  Created {formatDate(trip.createdAt)}
                </div>
              </div>
            </div>
          {/each}
        </div>
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
