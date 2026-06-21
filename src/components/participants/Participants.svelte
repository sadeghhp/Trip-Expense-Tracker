<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Plus, Pencil, Trash2, Users } from '@lucide/svelte';
  import { appData, updateData } from '$lib/stores/data';
  import { generateId } from '$lib/utils/id';
  import { validateParticipantName, isParticipantUsed } from '$lib/utils/validation';
  import type { Participant } from '$lib/types';
  import Modal from '../ui/Modal.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import EmptyState from '../layout/EmptyState.svelte';

  interface Props {
    showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  }

  let { showToast }: Props = $props();

  let showForm = $state(false);
  let editingId: string | null = $state(null);
  let nameInput = $state('');
  let formError = $state('');
  let deleteConfirm: Participant | null = $state(null);

  function openAdd() {
    editingId = null;
    nameInput = '';
    formError = '';
    showForm = true;
  }

  function openEdit(p: Participant) {
    editingId = p.id;
    nameInput = p.name;
    formError = '';
    showForm = true;
  }

  function handleSave() {
    const trimmed = nameInput.trim();
    const data = $appData;
    const existingNames = data.participants.map(p => p.name);

    const error = validateParticipantName(trimmed, existingNames, editingId ?? undefined, data.participants);
    if (error) {
      formError = error;
      return;
    }

    if (editingId) {
      updateData(d => ({
        ...d,
        participants: d.participants.map(p => p.id === editingId ? { ...p, name: trimmed } : p)
      }));
      showToast('Participant updated');
    } else {
      updateData(d => ({
        ...d,
        participants: [...d.participants, { id: generateId(), name: trimmed }]
      }));
      showToast('Participant added');
    }
    showForm = false;
  }

  function requestDelete(p: Participant) {
    if (isParticipantUsed(p.id, $appData.expenses)) {
      showToast('Cannot delete: participant is used in expenses', 'error');
      return;
    }
    deleteConfirm = p;
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    updateData(d => ({
      ...d,
      participants: d.participants.filter(p => p.id !== id)
    }));
    showToast('Participant deleted');
    deleteConfirm = null;
  }
</script>

<div class="p-4 md:p-6 space-y-4">
  {#if $appData.participants.length === 0}
    <EmptyState
      icon={Users}
      title="No participants yet"
      description="Add the people who are sharing expenses on this trip."
    >
      <button
        onclick={openAdd}
        class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-medium transition-all hover:shadow-md active:scale-95"
      >
        Add First Participant
      </button>
    </EmptyState>
  {:else}
    <div class="space-y-2">
      {#each $appData.participants as participant, i (participant.id)}
        <div
          class="flex items-center justify-between p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200"
          in:fly={{ y: 15, duration: 250, delay: i * 50 }}
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
              <span class="text-sm font-bold text-primary-700 dark:text-primary-300">
                {participant.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <span class="text-base font-medium text-[var(--text-primary)]">{participant.name}</span>
          </div>
          <div class="flex gap-1">
            <button
              onclick={() => openEdit(participant)}
              class="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] active:scale-90 transition-all"
            >
              <Pencil size={16} class="text-[var(--text-secondary)]" />
            </button>
            <button
              onclick={() => requestDelete(participant)}
              class="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-danger-500/10 active:scale-90 transition-all"
            >
              <Trash2 size={16} class="text-danger-500" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <button
    onclick={openAdd}
    class="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 hover:scale-105 text-white shadow-lg shadow-[var(--fab-shadow)] flex items-center justify-center transition-all active:scale-90"
  >
    <Plus size={24} />
  </button>
</div>

<Modal open={showForm} title={editingId ? 'Edit Participant' : 'Add Participant'} onClose={() => showForm = false}>
  <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
    <div>
      <label for="name" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Name</label>
      <input
        id="name"
        type="text"
        bind:value={nameInput}
        placeholder="Enter name"
        class="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
        autofocus
      />
      {#if formError}
        <p class="mt-1.5 text-xs text-danger-500">{formError}</p>
      {/if}
    </div>
    <button
      type="submit"
      class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
    >
      {editingId ? 'Update' : 'Add Participant'}
    </button>
  </form>
</Modal>

<ConfirmDialog
  open={deleteConfirm !== null}
  title="Delete Participant"
  message="Are you sure you want to delete {deleteConfirm?.name ?? ''}? This cannot be undone."
  confirmLabel="Delete"
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>
