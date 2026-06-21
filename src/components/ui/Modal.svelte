<script lang="ts">
  import { fly } from 'svelte/transition';
  import { X } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  let { open, title, onClose, children }: Props = $props();

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
    onclick={handleBackdrop}
    transition:fly={{ duration: 150 }}
  >
    <div
      class="w-full md:max-w-lg md:mx-4 bg-[var(--card-bg)] rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
      transition:fly={{ y: 100, duration: 250 }}
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        <button
          onclick={onClose}
          class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-4">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
