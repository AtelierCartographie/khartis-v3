import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-map-layers.svelte.ts'),
  'utf8'
);

describe('useMapLayers source', () => {
  it('keeps file-backed custom basemap metadata layers available to the renderer', () => {
    expect(source).toContain('if (currentMetadata) {');
    expect(source).not.toContain(
      'if (currentMetadata && !currentMetadata.isCustom && worldBaseTable) {'
    );
    expect(source).toContain(': currentMetadata.isCustom');
    expect(source).toContain(
      'availableMetadataLayerTypes: metadataLayers.map('
    );
  });

  it('falls back to DuckDB metadata when resolving source table names', () => {
    expect(source).toContain(
      'duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)'
    );
    expect(source).toContain(
      'duckDBOrchestrator.getDatasetById(datasetId)?.tableName'
    );
  });

  it('requests hydrography metadata when lakes and rivers are visible', () => {
    const body = source.match(
      /function getRequestedMetadataLayerTypes[\s\S]*?return \[\.\.\.requestedTypes\];\n\s*\}/
    )?.[0];

    expect(body).toContain("case 'lacs':");
    expect(body).toContain('requestedTypes.add(BasemapLayerType.POLYGON)');
    expect(body).toContain("case 'rivieres':");
    expect(body).toContain('requestedTypes.add(BasemapLayerType.LINE)');
  });

  it('requests foreground metadata for borders and cities only', () => {
    const body = source.match(
      /function getRequestedMetadataLayerTypes[\s\S]*?return \[\.\.\.requestedTypes\];\n\s*\}/
    )?.[0];

    expect(body).toContain("case 'frontieres':");
    expect(body).toContain('requestedTypes.add(BasemapLayerType.LIMIT)');
    expect(body).toContain("case 'villes':");
    expect(body).toContain('requestedTypes.add(BasemapLayerType.CENTROID)');
    expect(body).toContain('requestedTypes.add(BasemapLayerType.POINT)');
    expect(body).not.toContain("case 'meridiens':");
    expect(body).not.toContain('BasemapLayerType.GRATICULE');
    expect(body).not.toContain("case 'equateur':");
    expect(body).not.toContain('BasemapLayerType.GEOGRAPHIC_LINES');
  });

  it('passes the active basemap bbox to generated basemap layers', () => {
    expect(source).toContain(
      'bbox: currentMetadata?.bbox ?? projectionFitBbox'
    );
  });

  it('only applies modelMatrix in the Deck.gl OrthographicView engine', () => {
    expect(source).toContain(
      'const isOrthographicMode = !deckOverlay && Boolean(deckInstance);'
    );
    expect(source).toContain('const matrixToApply = isOrthographicMode');
    expect(source).toContain('modelMatrix: matrixToApply ?? undefined');
  });

  it('does not restore stale orthographic basemap layers after the basemap is disabled', () => {
    expect(source).toContain('ORTHOGRAPHIC_BASEMAP_LAYER_PREFIXES');
    expect(source).toContain('function isOrthographicBasemapLayer(');
    expect(source).toContain('function getPreservablePreviousLayers(');
    expect(source).toContain('!isOrthographicBasemapLayer(layer)');
    expect(source).toContain('const previousLayersToPreserve =');
    expect(source).toContain('setLayers(previousLayersToPreserve)');
    expect(source).toContain('lastAppliedLayers = previousLayersToPreserve;');
  });

  it('only shows orthographic basemap layers for an explicit basemap reference or joined data', () => {
    expect(source).toContain('const datasetContentIds = new Set<string>();');
    expect(source).toContain('let hasJoinedBasemapReference = false;');
    expect(source).toContain('hasDatasetContent: datasetContentIds.size > 0');
    expect(source).toContain(
      'Boolean(basemapStyleStore.referenceBasemapId) ||'
    );
    expect(source).toContain('hasJoinedBasemapReference');
  });

  it('limits split basemap geometry to joined rows while a manual projection is active', () => {
    expect(source).toContain('function getManualProjectionSplitReferenceTable');
    expect(source).toContain('getSplitMatchedGeometryRowIndices(');
    expect(source).toContain(
      'selectRowsByIndices(split.geometry, matchedRows)'
    );
    expect(source).toContain(
      'const basemapGeometryTable =\n        manualProjectionBasemapTable ?? worldBaseTable;'
    );
    expect(source).toContain(
      'getRequestedMetadataLayerTypes(basemapGeometryTable)'
    );
    expect(source).toContain(
      'createBasemapLayers(\n            basemapGeometryTable,'
    );
  });

  it('preserves explicit null projection metadata for standalone geofiles', () => {
    expect(source).toContain('function getDatasetProjectionMetadata(');
    expect(source).toContain('metadata === undefined ? currentMetadata');
    expect(source).toContain('!basemapStyleStore.referenceBasemapId');
    expect(source).toContain('!getDatasetJoinedBasemap(datasetId)');
  });

  it('preloads joined-basemap centroid tables before symbol visualizations request them', () => {
    expect(source).toContain('const joinedBasemapId = getDatasetJoinedBasemap');
    expect(source).toContain('prefetchRepresentativePointTable(');
    expect(source).toContain('joinedBasemapId');
    expect(source).toContain(
      'basemapService.getBasemapLayerTableByType(\n        joinedBasemapId,\n        BasemapLayerType.CENTROID'
    );
    expect(source).toContain(
      'representativePointTableCache.set(sourceTable, loadedCentroidTable)'
    );
  });
});
