<script lang="ts">
  import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import ThematicMap from '$lib/features/map/components/thematic-map.svelte';
  import type { FacetsLayout } from './facets.store.svelte';
  import type {
    FacetSyncViewState,
    SplitRenderingTable
  } from '$lib/features/map/types';

  let {
    visualizations,
    tables,
    densityTables,
    splitData,
    geoJSONs,
    layout,
    syncPanZoom = false,
    containerWidth = 1200,
    containerHeight = 800,
    pageAspectRatio = 0.75,
    onReady
  }: {
    visualizations: VisualizationConfig[];
    tables: Map<string, ArrowTable>;
    densityTables?: Map<string, ArrowTable>;
    splitData?: Map<string, SplitRenderingTable>;
    geoJSONs: Map<string, FeatureCollection>;
    layout: FacetsLayout;
    syncPanZoom?: boolean;
    containerWidth?: number;
    containerHeight?: number;
    pageAspectRatio?: number;
    onReady?: () => void;
  } = $props();

  const TITLE_HEIGHT = 28;
  const MIN_CELL = 80;

  const mapCount = $derived(visualizations.length);

  const effectiveColumns = $derived(
    Math.max(1, Math.min(layout.columns, mapCount || 1))
  );

  const effectiveRows = $derived(
    mapCount > 0 ? Math.ceil(mapCount / effectiveColumns) : 1
  );

  const cellSize = $derived.by(() => {
    if (mapCount === 0) {
      return { width: 0, height: 0 };
    }

    const cols = effectiveColumns;
    const rows = effectiveRows;
    const availableW = containerWidth - (cols - 1) * layout.gap;
    const availableH =
      containerHeight - (rows - 1) * layout.gap - TITLE_HEIGHT * rows;

    const widthPerCol = Math.max(MIN_CELL, Math.floor(availableW / cols));
    const heightPerRow = Math.max(MIN_CELL, Math.floor(availableH / rows));

    const constrainedByHeight = Math.floor(heightPerRow / pageAspectRatio);
    const constrainedByWidth = Math.floor(widthPerCol * pageAspectRatio);

    const width = Math.min(widthPerCol, constrainedByHeight);
    const height = Math.min(heightPerRow, constrainedByWidth);

    return { width, height };
  });

  const facetWidth = $derived(cellSize.width);
  const facetHeight = $derived(cellSize.height);

  const gridStyle = $derived(
    [
      `grid-template-columns: repeat(${effectiveColumns}, ${facetWidth}px)`,
      `grid-auto-rows: ${facetHeight + TITLE_HEIGHT}px`,
      `gap: ${layout.gap}px`
    ].join('; ')
  );

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

<div class="facets-grid-wrapper">
  <div class="facets-grid" style={gridStyle}>
    {#each visualizations as viz, idx (viz.id)}
      <div class="facet-cell" style:width="{facetWidth}px">
        <h4 class="facet-title">{viz.name}</h4>
        <ThematicMap
          tables={tables}
          densityTables={densityTables}
          splitData={splitData}
          geoJSONs={geoJSONs}
          width={facetWidth}
          height={facetHeight}
          forcedVisualizationIds={[viz.id]}
          onReady={idx === 0 ? onReady : undefined}
          onMoveSync={syncPanZoom ? (s) => handleMoveSync(idx, s) : undefined}
          syncViewState={getSyncViewState(idx)}
          showLegendOverlay={false}
          showGeoIndicationsOverlay={false}
          showAnnotationOverlay={false}
          isFacetCell={true}
        />
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .facets-grid-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 16px;
  }

  .facets-grid {
    display: grid;
    justify-content: center;
    align-content: center;
    justify-items: center;
    align-items: center;
  }

  .facet-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }

  .facet-title {
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    color: var(--cds-text-primary, #161616);
    margin: 0;
    padding: 2px 8px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
