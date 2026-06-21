<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';

  interface Props {
    title: string;
    subtitle?: string;
    onBack?: () => void;
  }

  let { title, subtitle, onBack }: Props = $props();
</script>

<header class="sticky top-0 z-40 flex items-center gap-3 px-4 md:px-6 h-14 bg-[var(--header-bg)] backdrop-blur-xl border-b border-[var(--header-border)]">
  {#if onBack}
    <button
      onclick={onBack}
      class="w-8 h-8 -ml-1 rounded-xl flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
    >
      <ArrowLeft size={20} class="text-[var(--text-primary)]" />
    </button>
  {/if}
  <div class="min-w-0">
    <h1 class="text-xl font-bold tracking-tight text-[var(--text-primary)] truncate">
      {title}
    </h1>
    {#if subtitle}
      <p class="text-[10px] font-medium text-primary-500 dark:text-primary-400 truncate -mt-0.5">{subtitle}</p>
    {/if}
  </div>
  <div class="h-1 absolute bottom-0 left-0 right-0 bg-gradient-to-r from-primary-500/0 via-primary-500/20 to-primary-500/0"></div>
</header>
