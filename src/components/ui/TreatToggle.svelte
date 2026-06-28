<script lang="ts">
  import { t } from '$lib/i18n';

  interface Props {
    checked: boolean;
    onToggle: () => void;
  }

  let { checked, onToggle }: Props = $props();
</script>

<div class="flex items-start gap-3 p-3 rounded-xl border {checked ? 'border-accent-300 dark:border-accent-700 bg-accent-50 dark:bg-accent-900/20' : 'border-[var(--card-border)]'}">
  <button
    type="button"
    onclick={onToggle}
    class="w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all mt-0.5
      {checked ? 'border-accent-600 bg-accent-600' : 'border-[var(--card-border)]'}"
    aria-pressed={checked}
  >
    {#if checked}
      <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    {/if}
  </button>
  <div class="flex-1 min-w-0">
    <span class="text-sm font-medium text-[var(--text-primary)]">{$t('expenseForm.treat')}</span>
    <p class="text-xs text-[var(--text-secondary)] mt-0.5">{$t('expenseForm.treatHint')}</p>
  </div>
</div>
