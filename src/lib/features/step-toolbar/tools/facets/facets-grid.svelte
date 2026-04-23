<script lang="ts">
  import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import type { SplitRenderingTable } from '$lib/features/map/types';
  import FacetsSharedRenderer from './facets-shared-renderer.svelte';
  import type { FacetsLayout } from './facets.store.svelte';

  let {
    visualizations,
    tables,
    densityTables,
    splitData,
    geoJSONs,
    layout,
    syncPanZoom: _syncPanZoom = false,
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
</script>

<FacetsSharedRenderer
  visualizations={visualizations}
  tables={tables}
  densityTables={densityTables}
  splitData={splitData}
  geoJSONs={geoJSONs}
  layout={layout}
  containerWidth={containerWidth}
  containerHeight={containerHeight}
  pageAspectRatio={pageAspectRatio}
  onReady={onReady}
/>
