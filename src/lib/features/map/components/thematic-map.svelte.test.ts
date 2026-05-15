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
});
