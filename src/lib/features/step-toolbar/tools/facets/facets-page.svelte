<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import type { SplitRenderingTable } from '$lib/features/map/types';
  import AnnotationOverlay from '$lib/features/map/components/annotation-overlay.svelte';
  import GeoIndicationsOverlay from '$lib/features/map/components/geo-indications-overlay.svelte';
  import LegendOverlay from '$lib/features/map/components/legend-overlay.svelte';
  import {
    DEFAULT_PAGE_COLOR,
    getFormatState
  } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import FacetsGrid from './facets-grid.svelte';
  import type { FacetsLayout } from './facets.store.svelte';

  interface Props {
    visualizations: VisualizationConfig[];
    tables: Map<string, ArrowTable>;
    splitData?: Map<string, SplitRenderingTable>;
    geoJSONs: Map<string, FeatureCollection>;
    layout: FacetsLayout;
    syncPanZoom?: boolean;
    width: number;
    height: number;
    onReady?: () => void;
  }

  let {
    visualizations,
    tables,
    splitData,
    geoJSONs,
    layout,
    syncPanZoom = false,
    width,
    height,
    onReady
  }: Props = $props();

  const fmtState = $derived(getFormatState());
  const pageColor = $derived(
    typeof fmtState.color === 'object' && fmtState.color
      ? fmtState.color
      : DEFAULT_PAGE_COLOR
  );
  const pageBackgroundColor = $derived(
    hslToHex(pageColor.hue, pageColor.saturation, pageColor.lightness)
  );
  const pageMargins = $derived(fmtState.margins);
  const mapStageWidth = $derived(
    Math.max(1, width - pageMargins.left - pageMargins.right)
  );
  const mapStageHeight = $derived(
    Math.max(1, height - pageMargins.top - pageMargins.bottom)
  );
  const pageStyle = $derived(
    `background-color: ${pageBackgroundColor}; padding: ${pageMargins.top}px ${pageMargins.right}px ${pageMargins.bottom}px ${pageMargins.left}px;`
  );
  const pageAspectRatio = $derived(
    mapStageWidth > 0 ? mapStageHeight / mapStageWidth : 0.75
  );
  const mapStageStyle = $derived(
    `width: ${mapStageWidth}px; height: ${mapStageHeight}px; background-color: ${pageBackgroundColor};`
  );
  const isStylingMode = $derived(
    globalState.selectedStep === ToolbarStep.Styling
  );
</script>

<div class="facets-page" style={pageStyle}>
  <div class="facets-map-stage" style={mapStageStyle}>
    <FacetsGrid
      visualizations={visualizations}
      tables={tables}
      splitData={splitData}
      geoJSONs={geoJSONs}
      layout={layout}
      syncPanZoom={syncPanZoom}
      containerWidth={mapStageWidth}
      containerHeight={mapStageHeight}
      pageAspectRatio={pageAspectRatio}
      onReady={onReady}
    />

    <LegendOverlay />
    <GeoIndicationsOverlay interactive={isStylingMode} />
  </div>

  <AnnotationOverlay interactive={isStylingMode} />
</div>

<style lang="scss">
  .facets-page {
    position: relative;
    flex-shrink: 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .facets-map-stage {
    position: relative;
    overflow: hidden;
  }
</style>
