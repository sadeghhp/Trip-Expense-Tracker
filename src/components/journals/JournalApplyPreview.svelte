<script lang="ts">
  import { appData } from '$lib/stores/data';
  import { t } from '$lib/i18n';
  import { formatAmount, getParticipantName } from '$lib/utils/format';
  import type { JournalEntry } from '$lib/types';
  import { transformJournalEntry, buildTransformContext } from '$lib/utils/journal-apply';

  interface Props {
    entry: JournalEntry;
  }

  let { entry }: Props = $props();

  function participantLookup() {
    const lookup = new Map<string, string>();
    for (const p of $appData.participants) {
      lookup.set(p.name.toLowerCase(), p.id);
    }
    return lookup;
  }

  let preview = $derived.by(() => {
    const context = buildTransformContext(
      $appData,
      participantLookup(),
      new Set(),
      entry.id,
      entry.expenseId ?? undefined
    );
    return transformJournalEntry(entry, context);
  });
</script>

{#if preview.error}
  <div class="px-3 py-2 rounded-xl bg-danger-500/10 border border-danger-200 dark:border-danger-800 text-xs text-danger-600 dark:text-danger-400">
    {preview.error}
  </div>
{:else if preview.expense}
  <div class="px-3 py-2 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 text-xs text-primary-700 dark:text-primary-300 space-y-1">
    <p class="font-medium">{$t('journals.previewTitle')}</p>
    <p>
      {getParticipantName(preview.expense.paidBy, $appData.participants)}
      → {preview.expense.beneficiaries.map(b => getParticipantName(b.participantId, $appData.participants)).join(', ')}
    </p>
    <p>{formatAmount(preview.expense.amount)} {preview.expense.currencyCode} · {preview.expense.description}</p>
  </div>
{/if}
