<script lang="ts">
  interface Props {
    title: string;
  }

  let { title }: Props = $props();
</script>

<header class="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 h-14 bg-[var(--header-bg)] backdrop-blur-xl border-b border-[var(--header-border)]">
  <h1 class="text-xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
  <div class="h-1 absolute bottom-0 left-0 right-0 bg-gradient-to-r from-primary-500/0 via-primary-500/20 to-primary-500/0"></div>
</header>
