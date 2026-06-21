<script lang="ts">
  import { X } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { getReceiptImage } from '$lib/services/imageStore';
  import { t } from '$lib/i18n';

  interface Props {
    imageId: string;
    onClose: () => void;
  }

  let { imageId, onClose }: Props = $props();

  let imageUrl: string | null = $state(null);
  let loading = $state(true);

  $effect(() => {
    let active = true;
    let currentUrl: string | null = null;
    loading = true;
    imageUrl = null;

    getReceiptImage(imageId).then((url) => {
      if (active) {
        currentUrl = url;
        imageUrl = url;
        loading = false;
      } else if (url) {
        URL.revokeObjectURL(url);
      }
    }).catch(() => {
      if (active) loading = false;
    });

    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  transition:fly={{ duration: 150 }}
>
  <button
    onclick={onClose}
    class="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
  >
    <X size={20} class="text-white" />
  </button>

  {#if loading}
    <div class="text-white/60 text-sm">{$t('receipt.loadingImage')}</div>
  {:else if imageUrl}
    <img
      src={imageUrl}
      alt="Receipt"
      class="max-w-[95vw] max-h-[90vh] object-contain rounded-lg"
      transition:fly={{ y: 20, duration: 200 }}
    />
  {:else}
    <div class="text-white/60 text-sm">{$t('receipt.imageNotFound')}</div>
  {/if}
</div>
