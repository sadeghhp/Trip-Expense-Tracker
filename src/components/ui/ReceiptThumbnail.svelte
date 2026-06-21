<script lang="ts">
  import { getReceiptThumbnail } from '$lib/services/imageStore';

  interface Props {
    imageId: string;
    class?: string;
    onclick?: (e: MouseEvent) => void;
  }

  let { imageId, class: className = '', onclick }: Props = $props();

  let url: string | null = $state(null);

  $effect(() => {
    let active = true;
    let currentUrl: string | null = null;
    url = null;

    getReceiptThumbnail(imageId).then((u) => {
      if (active) {
        currentUrl = u;
        url = u;
      } else if (u) {
        URL.revokeObjectURL(u);
      }
    });

    return () => {
      active = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
    };
  });
</script>

{#if url}
  {#if onclick}
    <button type="button" {onclick} class={className}>
      <img src={url} alt="Receipt" class="w-full h-full object-cover" />
    </button>
  {:else}
    <img src={url} alt="Receipt" class={className} />
  {/if}
{/if}
