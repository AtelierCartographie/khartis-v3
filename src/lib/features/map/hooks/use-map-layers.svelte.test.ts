import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-map-layers.svelte.ts'),
  'utf8'
);

describe('useMapLayers source', () => {
  it('keeps file-backed custom basemap metadata layers available to the renderer', () => {
    expect(source).toContain('shouldShowBasemapLayers &&');
    expect(source).toContain('currentMetadata &&');
    expect(source).toContain('hasExplicitBasemapSelection');
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

  it('prefers the projection fit bbox for generated basemap layers', () => {
    expect(source).toContain('bbox: shouldShowBasemapLayers');
    expect(source).toContain(
      '? (projectionFitBbox ?? currentMetadata?.bbox ?? null)'
    );
    expect(source).toContain(': projectionFitBbox');
  });

  it('passes the orthographic canvas extent to generated graticule layers', () => {
    expect(source).toContain('function getVisibleProjectedCanvasExtent');
    expect(source).toContain('projectionStore.referenceBbox');
    expect(source).toContain('get_max_scale(');
    expect(source).toContain('const graticuleClipExtent');
    expect(source).toContain(
      'isOrthographicMode ? getVisibleProjectedCanvasExtent() : null'
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
    expect(source).toContain(
      'const hasDatasetContent = datasetContentIds.size > 0;'
    );
    expect(source).toContain('hasDatasetContent,');
    expect(source).toContain(
      'Boolean(basemapStyleStore.referenceBasemapId) ||'
    );
    expect(source).toContain('hasJoinedBasemapReference');
  });

  it('does not apply persisted auto projection overrides to generated layers', () => {
    expect(source).toContain(
      "if (!projState.overrideActive || projState.overrideSource !== 'manual')"
    );
    expect(source).toContain(
      'const projectionOverride = getProjectionOverride('
    );
  });

  it('applies manual projection clipping through Deck layers instead of a DOM overlay', () => {
    expect(source).toContain('createProjectionSphereMaskLayer');
    expect(source).toContain('applyProjectionSphereMask');
    expect(source).toContain(
      'isOrthographicMode && hasManualProjectionOverride'
    );
    expect(source).toContain('getProjectionForSphereMask?.()');
    expect(source).toContain('activeBasemapProjection');
    expect(source).toContain('projectionOverride');
  });

  it('keeps generated ocean off imported data until customized or a manual projection needs it', () => {
    expect(source).toContain('GENERATED_ORTHOGRAPHIC_BASEMAP_LAYER_IDS');
    expect(source).toContain('GENERATED_ORTHOGRAPHIC_OCEAN_LAYER_IDS');
    expect(source).toContain('function hasVisibleGeneratedBasemapLayer(');
    expect(source).toContain('const hasManualProjectionOverride =');
    expect(source).toContain('const shouldShowGeneratedOceanLayer =');
    expect(source).toContain('shouldShowGeneratedOrthographicOceanLayer({');
    expect(source).toContain('function hasCustomizedGeneratedOceanStyle()');
    expect(source).toContain('hasCustomizedOceanStyle:');
    expect(source).toContain('function isGeneratedOceanLayer(');
    expect(source).toContain('basemapGroups.background.filter');
  });

  it('keeps generated graticule layers renderable without a catalog basemap', () => {
    expect(source).toContain('GENERATED_ORTHOGRAPHIC_CONTEXT_LAYER_IDS');
    expect(source).toContain('const shouldShowGeneratedContextLayers =');
    expect(source).toContain('const shouldShowGeneratedBasemapLayers =');
    expect(source).toContain(
      'shouldShowBasemapLayers || shouldShowGeneratedBasemapLayers'
    );
  });

  it('does not attach catalog basemap tables to generated-only layers', () => {
    expect(source).toContain('shouldShowBasemapLayers &&');
    expect(source).toContain('currentMetadata &&');
    expect(source).toContain('hasExplicitBasemapSelection');
    expect(source).toContain('shouldShowBasemapLayers ? worldBaseTable : null');
    expect(source).toContain('projection: shouldShowBasemapLayers');
    expect(source).toContain('stylePresets: shouldShowBasemapLayers');
  });

  it('keeps split dataset geometry out of catalog basemap rendering', () => {
    expect(source).not.toContain(
      'function getManualProjectionSplitReferenceTable'
    );
    expect(source).toContain('function getMatchedSplitTable(');
    expect(source).toContain('getSplitMatchedGeometryRowIndices(');
    expect(source).toContain('selectRowsByIndices(table, matchedRows)');
    expect(source).toContain('getMatchedSplitTable(split.geometry, split)');
    expect(source).toContain(
      'getMatchedSplitTable(rawRepresentativePointBaseTable, split)'
    );
    expect(source).not.toContain('manualProjectionBasemapTable');
    expect(source).toContain('getRequestedMetadataLayerTypes(worldBaseTable)');
    expect(source).toContain(
      'createBasemapLayers(\n            shouldShowBasemapLayers ? worldBaseTable : null,'
    );
  });

  it('filters split representative point tables through the joined dataset rows', () => {
    expect(source).toContain('function filterSplitGeometryTableByDatasetRows(');
    expect(source).toContain(
      'const dataFilteredDataset = filterArrowTableByDataFilters(\n      split.dataset,'
    );
    expect(source).toContain(
      'filterSplitGeometryTableByDatasetRows(\n                    representativePointBaseTable,\n                    split,\n                    viz.dataFilters,\n                    PrimitiveFilterType.POINT'
    );
    expect(source).toContain(
      'getSplitMatchedGeometryRowIndices(\n      matchedGeometryTable,\n      filteredDataset,'
    );
  });

  it('does not preserve stale thematic layers when visualization filters return no rows', () => {
    expect(source).toContain('let hasEmptyFilteredVisualization = false;');
    expect(source).toContain(
      'if (filteredTable !== table && filteredTable.numRows === 0) {'
    );
    expect(source).toContain('hasEmptyFilteredVisualization = true;');
    expect(source).toContain(
      'const shouldPreservePreviousLayers =\n        !hasEmptyFilteredVisualization &&'
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
