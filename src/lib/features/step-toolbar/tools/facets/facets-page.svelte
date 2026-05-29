<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
  import type { SplitRenderingTable } from '$lib/features/map/types';
  import AnnotationOverlay from '$lib/features/map/components/annotation-overlay.svelte';
  import GeoIndicationsOverlay from '$lib/features/map/components/geo-indications-overlay.svelte';
  import LegendOverlay from '$lib/features/map/components/legend-overlay.svelte';
  import PageGridOverlay from '$lib/features/map/components/page-grid-overlay.svelte';
  import {
    DEFAULT_PAGE_COLOR,
    getFormatState
  } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import FacetsGrid from './facets-grid.svelte';
  import {
    facetsStore,
    SCALE_MODE,
    type FacetsLayout
  } from './facets.store.svelte';

  interface Props {
    visualizations: VisualizationConfig[];
    tables: Map<string, ArrowTable>;
    densityTables?: Map<string, ArrowTable>;
    splitData?: Map<string, SplitRenderingTable>;
    geoJSONs: Map<string, FeatureCollection>;
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
    geoJSONs,
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
  const pageMargins = $derived(fmtState.margins);
  const pageDisplayScale = $derived(
    Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1
  );
  const renderedPageMargins = $derived({
    top: pageMargins.top * pageDisplayScale,
    right: pageMargins.right * pageDisplayScale,
    bottom: pageMargins.bottom * pageDisplayScale,
    left: pageMargins.left * pageDisplayScale
  });
  const mapStageWidth = $derived(
    Math.max(
      1,
      Math.round(
        (logicalWidth - pageMargins.left - pageMargins.right) * pageDisplayScale
      )
    )
  );
  const mapStageHeight = $derived(
    Math.max(
      1,
      Math.round(
        (logicalHeight - pageMargins.top - pageMargins.bottom) *
          pageDisplayScale
      )
    )
  );
  const pageStyle = $derived(
    `background-color: ${pageBackgroundColor}; padding: ${renderedPageMargins.top}px ${renderedPageMargins.right}px ${renderedPageMargins.bottom}px ${renderedPageMargins.left}px;`
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
  const isVisualizationMode = $derived(
    globalState.selectedStep === ToolbarStep.Visualizations
  );
  // Legends preview from the Visualizations step onward (parity with the
  // single-map thematic view), and stay visible through Habillage/export.
  const showLegendPreview = $derived(isVisualizationMode || isStylingMode);
  // With an independent scale, each facet owns an anchored legend rendered in
  // its cell, so the single global legend is hidden; a shared scale keeps one.
  const isIndependentScale = $derived(
    facetsStore.scaleMode === SCALE_MODE.INDEPENDENT
  );
  const showPageGrid = $derived(fmtState.gridEnabled && isStylingMode);
</script>

<div class="facets-page" style={pageStyle}>
  {#if showPageGrid}
    <PageGridOverlay displayScale={pageDisplayScale} />
  {/if}

  <div class="facets-map-stage" style={mapStageStyle}>
    <FacetsGrid
      visualizations={visualizations}
      tables={tables}
      densityTables={densityTables}
      splitData={splitData}
      geoJSONs={geoJSONs}
      layout={layout}
      containerWidth={mapStageWidth}
      containerHeight={mapStageHeight}
      pageAspectRatio={pageAspectRatio}
      onReady={onReady}
    />

    <LegendOverlay hidden={!showLegendPreview || isIndependentScale} />
    <GeoIndicationsOverlay
      interactive={isStylingMode}
      hidden={!isStylingMode}
    />
  </div>

  <AnnotationOverlay interactive={isStylingMode} hidden={!isStylingMode} />
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
