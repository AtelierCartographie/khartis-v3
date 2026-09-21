<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
  import * as m from '$lib/paraglide/messages';
  import { Grid, List, Upload } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    selectedSource: BasemapSource;
    onSourceChange: (source: BasemapSource) => void;
    catalogContent: Snippet;
    importContent: Snippet;
    osmContent: Snippet;
    joinSection?: Snippet;
    showJoinSection?: boolean;
  }

  let {
    selectedSource,
    onSourceChange,
    catalogContent,
    importContent,
    osmContent,
    joinSection,
    showJoinSection = false
  }: Props = $props();

  const tabItems = $derived.by(() => [
    { icon: List, label: m.basemap_catalog(), iconSize: 16 },
    { icon: Upload, label: m.basemap_import(), iconSize: 16 },
    { icon: Grid, label: m.basemap_osm(), iconSize: 16 }
  ]);

  const TAB_INDEX_TO_SOURCE: readonly BasemapSource[] = [
    BasemapSource.CATALOG,
    BasemapSource.IMPORT,
    BasemapSource.OSM
  ];

  const activeTabIndex = $derived(
    TAB_INDEX_TO_SOURCE.indexOf(selectedSource) >= 0
      ? TAB_INDEX_TO_SOURCE.indexOf(selectedSource)
      : 0
  );

  function handleTabChange(index: number): void {
    const next = TAB_INDEX_TO_SOURCE[index];
    if (next === undefined || next === selectedSource) return;
    onSourceChange(next);
  }
</script>

<div class="basemap-panel-content">
  <div class="basemap-tabs-wrapper">
    <ToggleTabs
      size="lg"
      activeIndex={activeTabIndex}
      items={tabItems}
      onchange={handleTabChange}
    />
  </div>

  <div class="basemap-tab-body">
    {#if activeTabIndex === 0}
      {@render catalogContent()}
    {:else if activeTabIndex === 1}
      {@render importContent()}
    {:else}
      {@render osmContent()}
    {/if}
  </div>

  {#if showJoinSection && joinSection}
    <hr class="join-separator" />
    {@render joinSection()}
  {/if}
</div>

<style>
  .basemap-panel-content {
    display: flex;
    flex-direction: column;
  }

  .basemap-tabs-wrapper {
    margin-bottom: 12px;
  }

  .basemap-tabs-wrapper :global(.toggle-tab.active) {
    background-color: var(--cds-border-subtle-01);
  }

  .basemap-tab-body {
    display: flex;
    flex-direction: column;
  }

  .join-separator {
    border: none;
    border-top: 1px solid var(--cds-border-subtle-00, #e0e0e0);
    margin: 0;
  }
</style>
