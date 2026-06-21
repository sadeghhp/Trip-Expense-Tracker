<script lang="ts">
  interface Props {
    title: string;
  }

  let { title }: Props = $props();
</script>

<header class="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 h-14 bg-[var(--card-bg)]/80 backdrop-blur-xl border-b border-[var(--card-border)]">
  <h1 class="text-lg font-semibold text-[var(--text-primary)]">{title}</h1>
</header>
