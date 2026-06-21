<script lang="ts">
  import { fly } from 'svelte/transition';
  import { AlertTriangle } from '@lucide/svelte';
  import { t } from '$lib/i18n';

  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel,
    cancelLabel,
    destructive = false,
    onConfirm,
    onCancel
  }: Props = $props();

  let resolvedConfirmLabel = $derived(confirmLabel ?? $t('common.confirm'));
  let resolvedCancelLabel = $derived(cancelLabel ?? $t('common.cancel'));
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
    onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    transition:fly={{ duration: 150 }}
  >
    <div
      class="w-full max-w-sm bg-[var(--card-bg)] rounded-2xl shadow-2xl p-6"
      transition:fly={{ y: 30, duration: 200 }}
    >
      {#if destructive}
        <div class="w-12 h-12 rounded-full bg-danger-500/10 flex items-center justify-center mb-4 mx-auto">
          <AlertTriangle size={24} class="text-danger-500" />
        </div>
      {/if}
      <h3 class="text-lg font-semibold text-[var(--text-primary)] text-center mb-2">{title}</h3>
      <p class="text-sm text-[var(--text-secondary)] text-center mb-6">{message}</p>
      <div class="flex gap-3">
        <button
          onclick={onCancel}
          class="flex-1 py-2.5 px-4 rounded-xl border border-[var(--card-border)] text-sm font-medium text-[var(--text-primary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
        >
          {resolvedCancelLabel}
        </button>
        <button
          onclick={onConfirm}
          class="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium text-white transition-colors
            {destructive ? 'bg-danger-500 hover:bg-danger-600' : 'bg-primary-600 hover:bg-primary-700'}"
        >
          {resolvedConfirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
