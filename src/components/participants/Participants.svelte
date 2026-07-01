<script lang="ts">
  import { tick } from 'svelte';
  import { Plus, Pencil, Trash2, Users, Shield, ShieldOff } from '@lucide/svelte';
  import { appData, updateData } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { generateId } from '$lib/utils/id';
  import { validateParticipantName, isParticipantUsed } from '$lib/utils/validation';
  import { t } from '$lib/i18n';
  import type { Participant } from '$lib/types';
  import Modal from '../ui/Modal.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import EmptyState from '../layout/EmptyState.svelte';

  let showForm = $state(false);
  let editingId: string | null = $state(null);
  let nameInput = $state('');
  let formError = $state('');
  let deleteConfirm: Participant | null = $state(null);
  let nameInputEl = $state<HTMLInputElement | undefined>();

  let tankhahId = $derived($appData.tankhahParticipantId);

  $effect(() => {
    if (showForm) {
      let active = true;
      tick().then(() => tick()).then(() => { if (active) nameInputEl?.focus(); });
      return () => { active = false; };
    }
  });

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
      formError = $t(error.key, error.params);
      return;
    }

    if (editingId) {
      updateData(d => ({
        ...d,
        participants: d.participants.map(p => p.id === editingId ? { ...p, name: trimmed } : p)
      }));
      showToast($t('participants.updated'));
    } else {
      updateData(d => ({
        ...d,
        participants: [...d.participants, { id: generateId(), name: trimmed }]
      }));
      showToast($t('participants.added'));
    }
    showForm = false;
  }

  function toggleTankhah(p: Participant) {
    const isCurrentTankhah = $appData.tankhahParticipantId === p.id;
    if (isCurrentTankhah) {
      updateData(d => {
        const { tankhahParticipantId, ...rest } = d;
        return rest as typeof d;
      });
      showToast($t('participants.tankhahRemoved'));
    } else {
      updateData(d => ({ ...d, tankhahParticipantId: p.id }));
      showToast($t('participants.tankhahSet', { name: p.name }));
    }
  }

  function requestDelete(p: Participant) {
    if ($appData.tankhahParticipantId === p.id) {
      showToast($t('participants.cannotDeleteTankhah'), 'error');
      return;
    }
    if (isParticipantUsed(p.id, $appData.expenses)) {
      showToast($t('participants.cannotDelete'), 'error');
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
    showToast($t('participants.deleted'));
    deleteConfirm = null;
  }
</script>

<div class="p-4 md:p-6 space-y-4">
  {#if $appData.participants.length === 0}
    <EmptyState
      icon={Users}
      title={$t('participants.noParticipantsTitle')}
      description={$t('participants.noParticipantsDesc')}
    >
      <button
        onclick={openAdd}
        class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-medium transition-all hover:shadow-md active:scale-95"
      >
        {$t('participants.addFirst')}
      </button>
    </EmptyState>
  {:else}
    <div class="space-y-2">
      {#each $appData.participants as participant (participant.id)}
        {@const participantIsTankhah = participant.id === tankhahId}
        <div
          class="flex items-center justify-between p-4 bg-[var(--card-bg)] border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200
            {participantIsTankhah
              ? 'border-accent-300 dark:border-accent-700 bg-accent-50/30 dark:bg-accent-900/10'
              : 'border-[var(--card-border)] hover:border-primary-200 dark:hover:border-primary-800'}"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center
              {participantIsTankhah
                ? 'bg-accent-100 dark:bg-accent-900/40'
                : 'bg-primary-100 dark:bg-primary-900/40'}">
              {#if participantIsTankhah}
                <Shield size={18} class="text-accent-600 dark:text-accent-400" />
              {:else}
                <span class="text-sm font-bold text-primary-700 dark:text-primary-300">
                  {participant.name.charAt(0).toUpperCase()}
                </span>
              {/if}
            </div>
            <div class="flex flex-col">
              <span class="text-base font-medium text-[var(--text-primary)]">{participant.name}</span>
              {#if participantIsTankhah}
                <span class="text-[11px] font-semibold text-accent-600 dark:text-accent-400">{$t('participants.tankhahBadge')}</span>
              {/if}
            </div>
          </div>
          <div class="flex gap-1">
            <button
              onclick={() => toggleTankhah(participant)}
              title={participantIsTankhah ? $t('participants.removeTankhah') : $t('participants.setAsTankhah')}
              class="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all
                {participantIsTankhah
                  ? 'bg-accent-100 dark:bg-accent-900/30 hover:bg-accent-200 dark:hover:bg-accent-900/50'
                  : 'hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
            >
              {#if participantIsTankhah}
                <ShieldOff size={16} class="text-accent-600 dark:text-accent-400" />
              {:else}
                <Shield size={16} class="text-[var(--text-secondary)]" />
              {/if}
            </button>
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
    class="fixed mobile-fab end-4 md:bottom-6 md:end-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 hover:scale-105 text-white shadow-lg shadow-[var(--fab-shadow)] flex items-center justify-center transition-all active:scale-90"
  >
    <Plus size={24} />
  </button>
</div>

<Modal open={showForm} title={editingId ? $t('participants.editTitle') : $t('participants.addTitle')} onClose={() => showForm = false}>
  <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
    <div>
      <label for="name" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{$t('participants.nameLabel')}</label>
      <input
        bind:this={nameInputEl}
        id="name"
        type="text"
        bind:value={nameInput}
        placeholder={$t('participants.namePlaceholder')}
        class="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
      />
      {#if formError}
        <p class="mt-1.5 text-xs text-danger-500">{formError}</p>
      {/if}
    </div>
    <button
      type="submit"
      class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
    >
      {editingId ? $t('participants.update') : $t('participants.addParticipant')}
    </button>
  </form>
</Modal>

<ConfirmDialog
  open={deleteConfirm !== null}
  title={$t('participants.deleteTitle')}
  message={$t('participants.deleteMessage', { name: deleteConfirm?.name ?? '' })}
  confirmLabel={$t('common.delete')}
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>
