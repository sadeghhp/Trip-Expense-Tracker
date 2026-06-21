<script lang="ts">
  import type { Component, Snippet } from 'svelte';

  interface Props {
    icon: Component;
    title: string;
    description: string;
    children?: Snippet;
  }

  let { icon: Icon, title, description, children }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-20 px-6 text-center">
  <div class="relative mb-6">
    <div class="absolute inset-0 rounded-3xl bg-primary-200/40 dark:bg-primary-800/20 blur-xl scale-150"></div>
    <div class="relative w-20 h-20 rounded-3xl bg-primary-50 dark:bg-[#1e293b] border border-primary-100 dark:border-[#334155] flex items-center justify-center shadow-sm">
      <Icon size={36} class="text-primary-400 dark:text-primary-500" />
    </div>
  </div>
  <h3 class="text-lg font-bold text-[var(--text-primary)] mb-1.5">{title}</h3>
  <p class="text-sm text-[var(--text-secondary)] max-w-xs mb-5">{description}</p>
  {#if children}
    {@render children()}
  {/if}
</div>
