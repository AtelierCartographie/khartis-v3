import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-enrichment-basemap.svelte.ts'),
  'utf8'
);

describe('useEnrichmentBasemap preview hold', () => {
  it('does not hold the map skeleton while computing basemap suggestions', () => {
    expect(source).not.toContain('shouldHoldPreviewWhileResolvingSuggestions');
    expect(source).toContain('setPreviewHold(false);');
    expect(source).toContain('setPreviewHold(false, resolutionRunId);');
    expect(source).not.toContain('setPreviewHold(shouldHoldPreview');
    expect(source).not.toContain('await tick()');
  });

  it('does not compute join suggestions for a stale DuckDB dataset', () => {
    expect(source).toContain('function isCurrentSuggestionInput(');
    expect(source).toContain(
      'duckDBOrchestrator.findDatasetByIdOrSourceFile(datasetId)'
    );
    expect(source).toContain('function isMissingDuckTableError(');
  });

  it('starts the OSM reference path in the flat projection', () => {
    expect(source).toContain('mapProjectionStore.isGlobe');
    expect(source).toContain(
      'mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.MERCATOR)'
    );
  });

  it('keeps preferred overlay basemap separate from the active selection', () => {
    expect(source).toContain('function rememberPreferredBasemap(');
    expect(source).toContain('preferredOverlayBasemapId: basemapId');
    expect(source).toContain('preferredOverlayBasemapSource: source');
    expect(source).toContain(
      'dataTabState.enrichData.preferredOverlayBasemapId'
    );
  });

  it('does not auto-select suggestions while the overlay toggle is disabled', () => {
    expect(source).toContain(
      'dataTabState.enrichData.overlayBasemapEnabled &&'
    );
    expect(source).toContain('shouldAutoSelectSuggestedBasemap({');
  });
});
