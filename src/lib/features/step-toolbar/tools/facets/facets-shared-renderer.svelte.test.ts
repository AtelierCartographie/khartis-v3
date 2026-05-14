import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'facets-shared-renderer.svelte'),
  'utf8'
);

describe('facets shared renderer structure', () => {
  it('creates a single Deck instance and filters thematic layers by view id', () => {
    expect(source).toContain('new Deck({');
    expect(source).toContain('new OrthographicView({');
    expect(source).toContain('layerFilter: ({ layer, viewport }) => {');
    expect(source).toContain('return viewId ? viewport.id === viewId : true;');
    expect(source).toContain(
      'mapInstanceStore.setOrthographicViewStateAdapter'
    );
  });

  it('uses shared scale statistics and uncapped render pixel ratio for sharp facets', () => {
    expect(source).toContain('resolveSharedFacetScaleStats');
    expect(source).toContain(
      'return sharedScaleStats ? { ...context, ...sharedScaleStats } : context;'
    );
    expect(source).toContain('resolveMapRenderPixelRatio(');
    expect(source).not.toContain('FACET_RENDER_PIXEL_RATIO_MAX');
    expect(source).not.toContain('Math.min(resolvedPixelRatio');
  });

  it('does not subscribe the redraw effect to projectionStore state that it mutates itself', () => {
    expect(source).not.toContain('void projectionStore.modelMatrix;');
    expect(source).not.toContain('void projectionStore.referenceBbox;');
  });

  it('ignores persisted non-manual projection overrides in facet rendering', () => {
    expect(source).toContain('function getProjectionOverrideForRender(');
    expect(source).toContain("projectionState.overrideSource !== 'manual'");
    expect(source).toContain('resolveProjectionForRender(');
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

  it('does not inherit cached catalog projection metadata for standalone facet geofiles', () => {
    const helperStart = source.indexOf(
      'function getProjectionMetadataForDataset'
    );
    const helperEnd = source.indexOf(
      'function getProjectionViewportSize',
      helperStart
    );
    const helperSource = source.slice(helperStart, helperEnd);

    expect(helperSource).toContain('if (!datasetId)');
    expect(helperSource).toContain('const referenceBasemapId =');
    expect(helperSource).toContain('if (!referenceBasemapId)');
    expect(helperSource).toContain('return null;');
    expect(helperSource).toContain('resolveActiveBasemapMetadata');
    expect(helperSource).not.toContain(
      'if (!duckDataset?.joinedBasemap) {\n      return basemapService.currentMetadata;'
    );
  });
});
