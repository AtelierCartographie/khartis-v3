<script lang="ts">
  import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import ThematicMap from '$lib/features/map/components/thematic-map.svelte';
  import type { FacetsLayout } from './facets.store.svelte';
  import type { FacetSyncViewState } from '$lib/features/map/types';

  let {
    visualizations,
    tables,
    geoJSONs,
    layout,
    syncPanZoom = false,
    containerWidth = 1200,
    containerHeight: _containerHeight = 800
  }: {
    visualizations: VisualizationConfig[];
    tables: Map<string, ArrowTable>;
    geoJSONs: Map<string, FeatureCollection>;
    layout: FacetsLayout;
    syncPanZoom?: boolean;
    containerWidth?: number;
    containerHeight?: number;
  } = $props();

  const facetWidth = $derived(
    Math.floor(
      (containerWidth - (layout.columns - 1) * layout.gap) / layout.columns
    )
  );

  const facetHeight = $derived(Math.floor(facetWidth * 0.75));

  const gridColumns = $derived(`repeat(${layout.columns}, 1fr)`);
  const gap = $derived(`${layout.gap}px`);

  // Shared view state for pan/zoom sync
  let sharedViewState = $state<FacetSyncViewState | null>(null);
  let syncSourceIdx = $state<number>(-1);

  function handleMoveSync(idx: number, state: FacetSyncViewState): void {
    if (!syncPanZoom) return;
    syncSourceIdx = idx;
    sharedViewState = state;
  }

  function getSyncViewState(idx: number): FacetSyncViewState | null {
    if (!syncPanZoom || syncSourceIdx === idx) return null;
    return sharedViewState;
  }
</script>

<div
  class="facets-grid"
  style:grid-template-columns={gridColumns}
  style:gap={gap}
>
  {#each visualizations as viz, idx (viz.id)}
    <div class="facet-cell">
      <h4 class="facet-title">{viz.name}</h4>
      <ThematicMap
        tables={tables}
        geoJSONs={geoJSONs}
        width={facetWidth}
        height={facetHeight}
        forcedVisualizationIds={[viz.id]}
        onMoveSync={syncPanZoom ? (s) => handleMoveSync(idx, s) : undefined}
        syncViewState={getSyncViewState(idx)}
        showLegendOverlay={false}
        showGeoIndicationsOverlay={false}
        showAnnotationOverlay={false}
      />
    </div>
  {/each}
</div>

<style>
  .facets-grid {
    display: grid;
    width: 100%;
    height: 100%;
    padding: 16px;
    box-sizing: border-box;
  }

  .facet-cell {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }

  .facet-title {
    font-size: 14px;
    font-weight: 500;
    text-align: center;
    color: var(--cds-text-01);
    margin: 0;
    padding: 4px;
    background: var(--cds-layer-01);
    border-radius: 4px;
  }
</style>
