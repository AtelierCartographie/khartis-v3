<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
  import type { SplitRenderingTable } from '$lib/features/map';
  import AnnotationOverlay from '$lib/features/map/components/annotation-overlay.svelte';
  import GeoIndicationsOverlay from '$lib/features/map/components/geo-indications-overlay.svelte';
  import LegendOverlay from '$lib/features/map/components/legend-overlay.svelte';
  import PageGridOverlay from '$lib/features/map/components/page-grid-overlay.svelte';
  import {
    DEFAULT_PAGE_COLOR,
    getFormatState
  } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
  import { resolvePageInsetBox } from '$lib/features/step-toolbar/tools/format/page-insets.utils';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import {
    ColorBlindnessFilterDefs,
    getColorBlindnessMatrix,
    getColorBlindnessState,
    resolveColorBlindnessPageFilter
  } from '../color-blindness';
  import FacetsGrid from './facets-grid.svelte';
  import {
    type FacetsLayout,
    facetsStore,
    SCALE_MODE
  } from './facets.store.svelte';

  interface Props {
    visualizations: VisualizationConfig[];
    tables: Map<string, ArrowTable>;
    densityTables?: Map<string, ArrowTable>;
    splitData?: Map<string, SplitRenderingTable>;
    layout: FacetsLayout;
    width: number;
    height: number;
    logicalWidth?: number;
    logicalHeight?: number;
    displayScale?: number;
    onReady?: () => void;
  }

  let {
    visualizations,
    tables,
    densityTables,
    splitData,
    layout,
    width,
    height,
    logicalWidth = width,
    logicalHeight = height,
    displayScale = 1,
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
  const pageDisplayScale = $derived(
    Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1
  );
  const pageSize = $derived({ width: logicalWidth, height: logicalHeight });
  const marginBox = $derived(
    resolvePageInsetBox(pageSize, fmtState.margins, pageDisplayScale)
  );
  // The collection is drawn in the map frame, layout items in the margin box.
  const mapFrameBox = $derived(
    resolvePageInsetBox(pageSize, fmtState.mapFrame, pageDisplayScale)
  );
  const pageStyle = $derived(
    `background-color: ${pageBackgroundColor}; width: ${width}px; height: ${height}px;`
  );
  const mapStageStyle = $derived(
    `left: ${mapFrameBox.left}px; top: ${mapFrameBox.top}px; width: ${mapFrameBox.width}px; height: ${mapFrameBox.height}px; background-color: ${pageBackgroundColor};`
  );
  const layoutStageStyle = $derived(
    `left: ${marginBox.left}px; top: ${marginBox.top}px; width: ${marginBox.width}px; height: ${marginBox.height}px;`
  );
  const isStylingMode = $derived(
    globalState.selectedStep === ToolbarStep.Styling
  );
  const isDataStep = $derived(globalState.selectedStep === ToolbarStep.Data);
  // With an independent scale, each facet owns an anchored legend rendered in
  // its cell, so the single global legend is hidden; a shared scale keeps one.
  const isIndependentScale = $derived(
    facetsStore.scaleMode === SCALE_MODE.INDEPENDENT
  );
  const showPageGrid = $derived(fmtState.gridEnabled && isStylingMode);
  const colorBlindnessMatrix = $derived(
    getColorBlindnessMatrix(getColorBlindnessState().simulationType)
  );
  const colorBlindnessFilterStyle = $derived(
    resolveColorBlindnessPageFilter(
      colorBlindnessMatrix,
      globalState.isMapExporting
    )
  );
</script>

<ColorBlindnessFilterDefs matrix={colorBlindnessMatrix} />

<div class="facets-page" style="{pageStyle}{colorBlindnessFilterStyle}">
  {#if showPageGrid}
    <PageGridOverlay displayScale={pageDisplayScale} />
  {/if}

  <div class="facets-map-stage" style={mapStageStyle}>
    <FacetsGrid
      visualizations={visualizations}
      tables={tables}
      densityTables={densityTables}
      splitData={splitData}
      layout={layout}
      containerWidth={mapFrameBox.width}
      containerHeight={mapFrameBox.height}
      onReady={onReady}
    />
  </div>

  <!-- Layout items sit in the margin box, independent of the map frame, so
       they live outside the clipped map stage. -->
  <div class="layout-stage" style={layoutStageStyle}>
    <GeoIndicationsOverlay interactive={isStylingMode} hidden={isDataStep} />
  </div>

  <div class="layout-stage" style={layoutStageStyle}>
    <LegendOverlay hidden={isDataStep || isIndependentScale} />
  </div>

  <AnnotationOverlay interactive={isStylingMode} hidden={isDataStep} />
</div>

<style lang="scss">
  .facets-page {
    position: relative;
    flex-shrink: 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .facets-map-stage {
    position: absolute;
    overflow: hidden;
  }

  .layout-stage {
    position: absolute;
    pointer-events: none;
  }
</style>
