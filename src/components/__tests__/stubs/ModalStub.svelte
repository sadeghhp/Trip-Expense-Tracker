<script lang="ts">
  interface Props {
    open?: boolean;
    title?: string;
    onClose?: () => void;
    children?: import('svelte').Snippet;
  }

  let { open = false, title = '', onClose, children }: Props = $props();
</script>

{#if open}
  <div data-testid="csv-modal" data-title={title}>
    {@render children?.()}
  </div>
{/if}
