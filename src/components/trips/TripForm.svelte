<script lang="ts">
  import { tick } from 'svelte';
  import { createTrip, updateTrip } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import type { Trip } from '$lib/types';
  import Modal from '../ui/Modal.svelte';
  import { t } from '$lib/i18n';

  interface Props {
    open: boolean;
    trip: Trip | null;
    onClose: () => void;
  }

  let { open, trip, onClose }: Props = $props();

  let nameInput = $state('');
  let descriptionInput = $state('');
  let formError = $state('');
  let nameInputEl = $state<HTMLInputElement | undefined>();

  $effect(() => {
    if (open) {
      nameInput = trip?.name ?? '';
      descriptionInput = trip?.description ?? '';
      formError = '';
      let active = true;
      tick().then(() => tick()).then(() => { if (active) nameInputEl?.focus(); });
      return () => { active = false; };
    }
  });

  function handleSave() {
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      formError = $t('tripForm.nameRequired');
      return;
    }

    if (trip) {
      updateTrip(trip.id, { name: trimmedName, description: descriptionInput.trim() });
      showToast($t('tripForm.updated'));
    } else {
      createTrip(trimmedName, descriptionInput.trim());
      showToast($t('tripForm.created'));
    }
    onClose();
  }
</script>

<Modal open={open} title={trip ? $t('tripForm.editTitle') : $t('tripForm.createTitle')} onClose={onClose}>
  <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
    <div>
      <label for="trip-name" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{$t('tripForm.nameLabel')}</label>
      <input
        bind:this={nameInputEl}
        id="trip-name"
        type="text"
        bind:value={nameInput}
        placeholder={$t('tripForm.namePlaceholder')}
        class="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
      />
      {#if formError}
        <p class="mt-1.5 text-xs text-danger-500">{formError}</p>
      {/if}
    </div>
    <div>
      <label for="trip-desc" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{$t('tripForm.descLabel')} <span class="opacity-50">{$t('tripForm.descOptional')}</span></label>
      <textarea
        id="trip-desc"
        bind:value={descriptionInput}
        placeholder={$t('tripForm.descPlaceholder')}
        rows="3"
        class="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all resize-none"
      ></textarea>
    </div>
    <button
      type="submit"
      class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
    >
      {trip ? $t('tripForm.updateTrip') : $t('tripForm.createTrip')}
    </button>
  </form>
</Modal>
