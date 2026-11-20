<script lang="ts">
  import { fade } from 'svelte/transition';
  import { motionDuration } from '$lib/features/commons/utils/step-transition.svelte';
  import { pageGuidesStore } from '../stores/page-guides.store.svelte';

  let { displayScale = 1 }: { displayScale?: number } = $props();

  const scale = $derived(
    Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1
  );
  const guides = $derived(pageGuidesStore.guides);
</script>

<div class="page-guides" aria-hidden="true">
  {#each guides.vertical as x (`v${x}`)}
    <span
      class="page-guide page-guide--vertical"
      style:left="{x * scale}px"
      transition:fade={{ duration: motionDuration(120) }}
    ></span>
  {/each}
  {#each guides.horizontal as y (`h${y}`)}
    <span
      class="page-guide page-guide--horizontal"
      style:top="{y * scale}px"
      transition:fade={{ duration: motionDuration(120) }}
    ></span>
  {/each}
</div>

<style>
  .page-guides {
    position: absolute;
    inset: 0;
    z-index: var(--z-popover);
    pointer-events: none;
  }

  .page-guide {
    position: absolute;
    background: var(--cds-support-error, #da1e28);
  }

  .page-guide--vertical {
    top: 0;
    bottom: 0;
    width: 1px;
    transform: translateX(-0.5px);
  }

  .page-guide--horizontal {
    left: 0;
    right: 0;
    height: 1px;
    transform: translateY(-0.5px);
  }
</style>
