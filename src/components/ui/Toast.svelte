<script lang="ts">
  import { fly } from 'svelte/transition';
  import { CheckCircle, XCircle, Info } from '@lucide/svelte';
  import { toasts } from '$lib/stores/toast';

  const icons = { success: CheckCircle, error: XCircle, info: Info };
  const colors = {
    success: 'bg-success-600 text-white',
    error: 'bg-danger-500 text-white',
    info: 'bg-primary-600 text-white'
  };
</script>

<div class="fixed mobile-toast-top md:top-4 inset-x-4 md:start-auto md:end-4 md:w-80 z-[200] flex flex-col gap-2">
  {#each $toasts as msg (msg.id)}
    {@const Icon = icons[msg.type]}
    <div
      class="flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm {colors[msg.type]}"
      transition:fly={{ y: -20, duration: 200 }}
    >
      <Icon size={18} />
      <span class="text-sm font-medium flex-1">{msg.text}</span>
    </div>
  {/each}
</div>
