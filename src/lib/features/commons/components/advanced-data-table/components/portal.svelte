<script lang="ts">
  import { portal } from '$lib/features/commons/utils/portal';
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();
</script>

<div use:portal class="portal-container">
  {@render children?.()}
</div>

<style>
  .portal-container {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  .portal-container :global(*) {
    pointer-events: auto;
  }
</style>
