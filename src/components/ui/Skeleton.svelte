<script lang="ts">
  interface Props {
    rows?: number;
    type?: 'list' | 'card';
  }

  let { rows = 3, type = 'list' }: Props = $props();
</script>

<div class="space-y-3 animate-pulse">
  {#each Array(rows) as _, i}
    {#if type === 'card'}
      <div class="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl">
        <div class="flex items-start justify-between">
          <div class="flex-1 space-y-2">
            <div class="h-4 w-32 rounded-lg bg-[#e2e8f0] dark:bg-[#334155]"></div>
            <div class="h-3 w-48 rounded-lg bg-[#f1f5f9] dark:bg-[#1e293b]"></div>
          </div>
          <div class="h-5 w-16 rounded-lg bg-[#e2e8f0] dark:bg-[#334155]"></div>
        </div>
        <div class="mt-3 flex gap-1.5">
          <div class="h-5 w-14 rounded bg-[#f1f5f9] dark:bg-[#1e293b]"></div>
          <div class="h-5 w-14 rounded bg-[#f1f5f9] dark:bg-[#1e293b]"></div>
          <div class="h-5 w-14 rounded bg-[#f1f5f9] dark:bg-[#1e293b]"></div>
        </div>
      </div>
    {:else}
      <div class="flex items-center gap-3 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl">
        <div class="w-10 h-10 rounded-full bg-[#e2e8f0] dark:bg-[#334155]"></div>
        <div class="flex-1 space-y-2">
          <div class="h-4 w-28 rounded-lg bg-[#e2e8f0] dark:bg-[#334155]"></div>
          <div class="h-3 w-40 rounded-lg bg-[#f1f5f9] dark:bg-[#1e293b]"></div>
        </div>
        <div class="flex gap-1">
          <div class="w-8 h-8 rounded-lg bg-[#f1f5f9] dark:bg-[#1e293b]"></div>
          <div class="w-8 h-8 rounded-lg bg-[#f1f5f9] dark:bg-[#1e293b]"></div>
        </div>
      </div>
    {/if}
  {/each}
</div>
