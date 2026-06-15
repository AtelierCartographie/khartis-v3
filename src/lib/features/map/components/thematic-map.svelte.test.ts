import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'thematic-map.svelte'),
  'utf8'
);

describe('ThematicMap source', () => {
  it('does not render a fixed SVG projection mask over the Deck canvas', () => {
    expect(source).not.toContain('projection-mask-overlay');
    expect(source).not.toContain('buildProjectionMaskPath');
    expect(source).not.toContain('fill-rule="evenodd"');
  });

  it('renders the alignment grid at page level and keeps it aligned with the shared snap size', () => {
    expect(source).toContain(
      "import PageGridOverlay from './page-grid-overlay.svelte';"
    );
    expect(source).toContain('{#if showPageGrid}');
    expect(source).toContain(
      '<PageGridOverlay displayScale={pageDisplayScale} />'
    );
  });

  it('treats map export capture as a styling layout render without changing navigation state', () => {
    expect(source).toContain('globalState.isMapExporting');
    expect(source).toContain(
      'globalState.selectedStep === ToolbarStep.Visualizations &&\n      !globalState.isMapExporting'
    );
    expect(source).toContain(
      'globalState.selectedStep === ToolbarStep.Styling ||\n      globalState.isMapExporting'
    );
    expect(source).toContain('isMapExporting: globalState.isMapExporting');
  });

  it('throttles live MapLibre facet sync and caps facet cell pixel ratio', () => {
    expect(source).toContain('const FACET_CELL_RENDER_PIXEL_RATIO_MAX = 1;');
    expect(source).toContain(
      'let pendingMapLibreSyncFrameId: number | null = null;'
    );
    expect(source).toContain("map.on('move', scheduleMapLibreSync);");
    expect(source).toContain(
      '? Math.min(resolvedPixelRatio, FACET_CELL_RENDER_PIXEL_RATIO_MAX)'
    );
  });

  it('does not compensate for CSS page scaling when resolving the map pixel ratio', () => {
    expect(source).toContain(
      'resolveMapRenderPixelRatio(\n      typeof window'
    );
    expect(source).not.toContain('globalState.zoom.pageZoomScale,');
  });

  it('uses logical page dimensions for viewport refits and rendered dimensions for canvas sharpness', () => {
    expect(source).toContain('logicalMapCanvasWidth');
    expect(source).toContain('logicalMapCanvasHeight');
    expect(source).toContain('getProjectionForSphereMask: () =>');
    expect(source).toContain('getOrthographicRenderProjection(');
    expect(source).toContain('getModelMatrix: () => renderModelMatrix');
    expect(source).toContain('.scale([pageDisplayScale, pageDisplayScale, 1])');
    expect(source).toContain('.multiplyRight(modelMatrix)');
    expect(source).toContain(
      'projectionStore.setRenderScale(pageDisplayScale)'
    );
    expect(source).toContain(
      'projectionStore.setFitPadding(logicalMapViewportFitPaddingPx)'
    );
    // The render projection is now published atomically with the reference
    // bbox (paired so the scale bar inverts against the matching pixel space),
    // not as a standalone side effect of getOrthographicRenderProjection.
    expect(source).toContain('referenceState.renderProjection');
    expect(source).toContain('renderProjection: ProjectionLike | null');
    expect(source).toContain(
      'const viewportSnapshot = `${logicalMapCanvasWidth}x${logicalMapCanvasHeight}-${logicalMapViewportFitPaddingPx}`;'
    );
    expect(source).toContain("scheduleLayerUpdate('effect:canvasResize')");
  });

  it('uses the shared render-engine helper for MapLibre switching', () => {
    expect(source).toContain(
      "import { shouldUseMapLibreInterleaved } from '../utils/render-engine.utils';"
    );
    expect(source).toContain(
      'const shouldUseMapLibre = shouldUseMapLibreInterleaved({'
    );
    expect(source).toContain(
      'const initialViewMode = shouldUseMapLibreInterleaved({'
    );
  });

  it('applies requested basemap viewport presets before fitting dataset bounds in MapLibre', () => {
    const fitFunctionIndex = source.indexOf(
      'function fitMapLibreViewportAfterViewModeSwitch'
    );
    const presetGuardIndex = source.indexOf(
      "reason === 'basemap' && pendingMapLibreViewportPreset",
      fitFunctionIndex
    );
    const datasetFitIndex = source.indexOf(
      'const refBasemapId = basemapStyleStore.referenceBasemapId;',
      fitFunctionIndex
    );

    expect(fitFunctionIndex).toBeGreaterThan(-1);
    expect(presetGuardIndex).toBeGreaterThan(-1);
    expect(datasetFitIndex).toBeGreaterThan(-1);
    expect(presetGuardIndex).toBeLessThan(datasetFitIndex);
  });

  it('prefers user data bounds over the requested basemap viewport preset', () => {
    const helperStart = source.indexOf(
      'function applyPendingMapLibreViewportPreset'
    );
    const helperEnd = source.indexOf(
      'function fitMapLibreViewportAfterViewModeSwitch',
      helperStart
    );
    const helperSource = source.slice(helperStart, helperEnd);

    expect(helperSource).toContain('bounds: presetBounds');
    expect(helperSource).toContain('?? presetBounds');
    // Default framing prefers user data bounds, but an explicit scale-zone
    // change (preferPreset, carried with the pending request) must skip the
    // data bounds and reframe to the chosen zone extent.
    expect(helperSource).toContain(
      'preferPreset ? null : resolveUserDataBounds()'
    );
  });

  it('does not inherit catalog projection metadata for standalone geofiles', () => {
    expect(source).toContain('if (!datasetId) {');
    expect(source).toContain('if (!duckDataset?.joinedBasemap) {');
    expect(source).toContain('return null;');
    expect(source).not.toContain(
      'getProjectionMetadataForDataset(firstDatasetId) ??'
    );
  });

  it('prefers rendered dataset bounds for manual projection fits even when a joined basemap is referenced', () => {
    const helperStart = source.indexOf(
      'function shouldPreferDatasetProjectionBbox'
    );
    const helperEnd = source.indexOf(
      'function resolveRenderedReferenceBounds',
      helperStart
    );
    const helperSource = source.slice(helperStart, helperEnd);

    expect(helperSource).toContain(
      "projectionState.overrideSource === 'manual'"
    );
    expect(helperSource).toContain('Boolean(datasetBbox)');
    expect(helperSource).not.toContain('!basemapStyleStore.referenceBasemapId');
  });

  it('refreshes projection references without refitting the viewport on parameter changes', () => {
    expect(source).toContain('options: { fitViewport?: boolean } = {}');
    expect(source).toContain(
      'const shouldFitViewport = options.fitViewport ?? true;'
    );
    expect(source).toContain(
      "syncOrthographicViewportAfterViewModeSwitch('projection', {\n          fitViewport: false\n        })"
    );
    expect(source).toContain(
      "scheduleLayerUpdate('effect:projectionRenderTrigger')"
    );
  });

  it('invalidates Deck layers when visualization data filters change', () => {
    expect(source).toContain('const visualizationDataFiltersVersion');
    expect(source).toContain('void visualizationStore.version;');
    expect(source).toContain('filter.primitiveType ??');
    expect(source).toContain('filter.secondaryValue ??');
    expect(source).toContain('visualizationDataFiltersVersion,');
  });

  it('rebuilds Deck layers after a MapLibre style swap so beforeId matches the new style', () => {
    expect(source).toContain(
      'const hadPendingLayerUpdate = pendingLayerUpdate'
    );
    expect(source).toContain(
      'basemapStyleVersion: basemapStyleStore.styleVersion'
    );
    expect(source).toContain('scheduleLayerUpdate(');
    expect(source).toContain(
      "hadPendingLayerUpdate ? 'onStyleLoaded-pending' : 'onStyleLoaded'"
    );
    expect(source).toContain('onStyleChangeRequested: () => {');
    expect(source).toContain(
      "scheduleLayerUpdateAfterStyleIdle(map, 'onStyleChangeRequested')"
    );
    expect(source).toContain('function scheduleLayerUpdateAfterStyleIdle(');
    expect(source).toContain('scheduleLayerUpdate(`${source}:frame`)');
    expect(source).toContain("map.once('idle', () => {");
    expect(source).toContain('mapLayers.syncInterleavedLayerOrder();');
    expect(source).toContain(
      "scheduleLayerUpdateAfterStyleIdle(map, 'effect:selectedStyle-idle')"
    );
  });

  it('resyncs MapLibre basemap label language when the app locale changes', () => {
    expect(source).toContain(
      "import { getLocale } from '$lib/paraglide/runtime';"
    );
    expect(source).toContain('mapBasemap.syncBasemapLanguage();');
    expect(source).toContain('void getLocale();');
    expect(source).toContain(
      'untrack(() => mapBasemap.syncBasemapLanguage());'
    );
  });

  it('does not let stale reference basemap requests release loading state', () => {
    const effectStart = source.indexOf(
      'const requestId = ++referenceBasemapRequestId;'
    );
    const finallyStart = source.indexOf('} finally {', effectStart);
    const finallyBody = source.slice(finallyStart, finallyStart + 240);

    expect(finallyBody).toContain(
      'if (requestId === referenceBasemapRequestId)'
    );
    expect(finallyBody.indexOf('if (requestId')).toBeLessThan(
      finallyBody.indexOf('isLoadingReferenceBasemap = false;')
    );
  });
});
