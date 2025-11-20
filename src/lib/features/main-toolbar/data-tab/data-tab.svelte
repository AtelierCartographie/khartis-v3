<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import clsx from 'clsx';
  import { onMount } from 'svelte';
  import BasemapJoinStep from './basemap-join-step.svelte';
  import DataControlStep from './data-control-step.svelte';
  import GeolocationStep from './geolocation-step.svelte';
  import { dataTabStore } from './data-tab.store.svelte';

  // Update navigation permissions when datasets change
  $effect(() => {
    dataTabStore.updateNavigationPermissions();
  });

  // Initialize on mount
  onMount(() => {
    dataTabStore.updateNavigationPermissions();
  });
</script>

<div
  id="khartis-data-tab"
  class={clsx(
    globalState.toolbarState === ToolbarState.Collapsed && 'collapsed-content'
  )}
>
  <!-- All three steps visible in vertical scroll -->
  <DataControlStep />
  <GeolocationStep />
  <BasemapJoinStep />
</div>

<style>
  #khartis-data-tab {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
    padding-bottom: var(--cds-spacing-06);
  }

  #khartis-data-tab > :global(section) {
    border-bottom: 1px solid var(--cds-border-subtle);
    padding-bottom: var(--cds-spacing-06);
  }

  #khartis-data-tab > :global(section:last-child) {
    border-bottom: none;
    padding-bottom: 0;
  }

  :global(.collapsed-content) {
    opacity: 0.7;
    pointer-events: none;
  }
</style>
