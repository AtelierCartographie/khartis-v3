<script lang="ts">
  import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { SplitRenderingTable } from '$lib/features/map';
  import FacetsSharedRenderer from './facets-shared-renderer.svelte';
  import type { FacetsLayout } from './facets.store.svelte';

  let {
    visualizations,
    tables,
    densityTables,
    splitData,
    layout,
    containerWidth = 1200,
    containerHeight = 800,
    onReady
  }: {
    visualizations: VisualizationConfig[];
    tables: Map<string, ArrowTable>;
    densityTables?: Map<string, ArrowTable>;
    splitData?: Map<string, SplitRenderingTable>;
    layout: FacetsLayout;
    containerWidth?: number;
    containerHeight?: number;
    onReady?: () => void;
  } = $props();
</script>

<FacetsSharedRenderer
  visualizations={visualizations}
  tables={tables}
  densityTables={densityTables}
  splitData={splitData}
  layout={layout}
  containerWidth={containerWidth}
  containerHeight={containerHeight}
  onReady={onReady}
/>
