import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'basemap-join-step.svelte'),
  'utf8'
);

describe('BasemapJoinStep reference basemap selection', () => {
  it('keeps GPS datasets on catalog suggestions instead of auto-activating OSM', () => {
    expect(source).not.toContain('shouldAutoPreferOSMForGPS');
    expect(source).not.toContain("autoSelectionTarget === 'osm'");
  });

  it('returns dataset changes to the catalog tab instead of keeping the reference path active', () => {
    expect(source).toContain('basemapSource: BasemapSource.CATALOG');
    expect(source).not.toContain("dataTabActions.selectBasemap('');");
  });

  it('activates Carte Facile Monde Couleurs for the manual reference basemap path', () => {
    expect(source).toContain('BasemapStyle.MONDE_COULEURS');
    expect(source).toContain('osmBasemapStore.clear();');
    expect(source).toContain('basemapStyleStore.setStyle(referenceStyle);');
    expect(source).toContain(
      'basemapStyleStore.requestViewportReset(referenceStyle);'
    );
  });

  it('starts the manual OSM reference path in the flat projection', () => {
    expect(source).toContain('mapProjectionStore.isGlobe');
    expect(source).toContain(
      'mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.MERCATOR)'
    );
  });

  it('does not treat a catalog basemap as an active reference basemap', () => {
    expect(source).toContain(
      'isActive={dataTabState.basemapJoin.basemapSource === BasemapSource.OSM &&'
    );
    expect(source).toContain('isOSMBasemapId(basemapSelected)');
    expect(source).not.toContain(
      'dataTabState.basemapJoin.basemapSource === BasemapSource.OSM &&\n        Boolean(basemapSelected)'
    );
  });

  it('hydrates dataset join metadata when finalizing a basemap join', () => {
    expect(source).toContain('function syncSelectedDatasetJoinedBasemap');
    expect(source).toContain(
      'datasetsStore.updateDatasetJoinBasemap(datasetId, joinedBasemap)'
    );
    expect(source).toContain('syncSelectedDatasetJoinedBasemap(basemap.file)');
  });

  it('does not re-finalize a restored catalog join that is already active in DuckDB', () => {
    expect(source).toContain('function isCatalogJoinFinalizedForBasemap');
    expect(source).toContain('duckDataset.joinedBasemap === basemapId');
    expect(source).toContain('duckDataset.geoColumn === geoColumn');
    expect(source).toContain('hasCurrentJoinStats()');
    expect(source).toContain('requestBasemapAttributeValues();');
    expect(source).toContain(
      'const stats = await duckDBOrchestrator.computeJoinStats('
    );
  });

  it('ties the join loader to the latest async request', () => {
    expect(source).toContain('function beginJoinLoading');
    expect(source).toContain('function endJoinLoading');
    expect(source).toContain('function cancelJoinLoading');
    expect(source).toContain('function abortCurrentJoin');
    expect(source).toContain('endJoinLoading(loadingRequestId);');
  });

  it('keys basemap attribute values by the requested basemap', () => {
    expect(source).toContain('basemapAttributeValuesRequestId');
    expect(source).toContain('basemapAttributeValuesBasemapId');
    expect(source).toContain('basemapAttributeValuesLoadingKey');
    expect(source).toContain(
      'isCurrentBasemapAttributeValuesRequest(requestId, basemapId)'
    );
  });

  it('skips computeAndAutoFinalizeJoin when the join is already finalized in DuckDB', () => {
    const effectStart = source.indexOf(
      'void computeAndAutoFinalizeJoin(basemap, abortSignal, linkedVariableName);'
    );
    expect(effectStart).toBeGreaterThan(-1);
    const guardWindow = source.slice(
      Math.max(0, effectStart - 600),
      effectStart
    );
    expect(guardWindow).toContain('isCatalogJoinFinalizedForBasemap(');
    expect(guardWindow).toContain('selectedBasemapId');
    expect(guardWindow).toContain('linkedVariableName');
    expect(guardWindow).toContain(
      'dataTabStore.markStepComplete(basemapStepIndex)'
    );
  });
});
