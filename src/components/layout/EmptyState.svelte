<script lang="ts">
  import type { Component } from 'svelte';

  interface Props {
    icon: Component;
    title: string;
    description: string;
  }

  let { icon: Icon, title, description }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-16 px-6 text-center">
  <div class="w-16 h-16 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
    <Icon size={28} class="text-[var(--text-secondary)]" />
  </div>
  <h3 class="text-base font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
  <p class="text-sm text-[var(--text-secondary)] max-w-xs">{description}</p>
</div>
