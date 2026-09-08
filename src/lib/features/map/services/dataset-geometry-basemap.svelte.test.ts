import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapMetadata } from '../types/basemap.types';

const mocks = vi.hoisted(() => ({
  createBasemapFromGeometryTable: vi.fn(),
  createArrowTableFromDuckTable: vi.fn(async () => ({ numRows: 3 })),
  addCustomBasemap: vi.fn(),
  getBasemapById: vi.fn(),
  registerCustomBasemap: vi.fn(async () => undefined),
  setReferenceBasemap: vi.fn(),
  referenceBasemapId: null as string | null
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {}
}));

vi.mock('./basemap-import.service', () => ({
  createBasemapFromGeometryTable: mocks.createBasemapFromGeometryTable,
  createArrowTableFromDuckTable: mocks.createArrowTableFromDuckTable
}));

vi.mock('./basemap-catalog.service.svelte', () => ({
  basemapCatalogService: {
    addCustomBasemap: mocks.addCustomBasemap,
    getBasemapById: mocks.getBasemapById
  }
}));

vi.mock('./basemap.service.svelte', () => ({
  basemapService: {
    registerCustomBasemap: mocks.registerCustomBasemap
  }
}));

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    get referenceBasemapId() {
      return mocks.referenceBasemapId;
    },
    setReferenceBasemap: mocks.setReferenceBasemap
  }
}));

const {
  ensureDatasetGeometryBasemap,
  forgetDatasetGeometryBasemap,
  activateDatasetGeometryBasemap
} = await import('./dataset-geometry-basemap.service');

function createMetadata(file: string): BasemapMetadata {
  return {
    file,
    title_fr: 'regions.geojson',
    title_en: 'regions.geojson',
    source: 'custom',
    date: '2026',
    bbox: [0, 0, 1, 1],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'identity' },
    layers: [
      { type: BasemapLayerType.POLYGON, style: null },
      { type: BasemapLayerType.LIMIT, file: `${file}__outerlines`, style: null }
    ],
    isCustom: true,
    isDatasetGeometry: true
  };
}

const geoDataset = {
  name: 'regions.geojson',
  tableName: 'regions_geojson',
  geometry: { columnName: 'geom' }
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.referenceBasemapId = null;
  mocks.getBasemapById.mockReturnValue(null);
  mocks.createBasemapFromGeometryTable.mockImplementation(
    async (_duck: unknown, tableName: string) => ({
      basemap: createMetadata(tableName),
      tableName,
      geometryTable: { numRows: 3 }
    })
  );
  forgetDatasetGeometryBasemap(geoDataset.tableName);
  forgetDatasetGeometryBasemap('regions_geojson__simplified');
});

describe('dataset geometry basemap', () => {
  it('should derive the helper layers and claim the empty reference slot', async () => {
    await ensureDatasetGeometryBasemap(geoDataset);

    expect(mocks.createBasemapFromGeometryTable).toHaveBeenCalledWith(
      expect.anything(),
      'regions_geojson',
      { title: 'regions.geojson', geometryColumn: 'geom' }
    );
    expect(mocks.registerCustomBasemap).toHaveBeenCalledOnce();
    expect(mocks.setReferenceBasemap).toHaveBeenCalledWith('regions_geojson');
  });

  it('should skip a dataset joined to a basemap', async () => {
    await ensureDatasetGeometryBasemap({
      ...geoDataset,
      joinedBasemap: 'france-regions-2025'
    });

    expect(mocks.createBasemapFromGeometryTable).not.toHaveBeenCalled();
  });

  it('should skip a dataset without geometry', async () => {
    await ensureDatasetGeometryBasemap({
      name: 'stats.csv',
      tableName: 'stats_csv',
      geometry: null
    });

    expect(mocks.createBasemapFromGeometryTable).not.toHaveBeenCalled();
  });

  it('should leave a reference basemap the user picked untouched', async () => {
    mocks.referenceBasemapId = 'france-regions-2025';

    await ensureDatasetGeometryBasemap(geoDataset);

    expect(mocks.addCustomBasemap).toHaveBeenCalledOnce();
    expect(mocks.registerCustomBasemap).not.toHaveBeenCalled();
    expect(mocks.setReferenceBasemap).not.toHaveBeenCalled();
  });

  it('should derive again for the table a simplification produced', async () => {
    await ensureDatasetGeometryBasemap(geoDataset);
    mocks.referenceBasemapId = 'regions_geojson';
    mocks.getBasemapById.mockReturnValue(createMetadata('regions_geojson'));

    await ensureDatasetGeometryBasemap({
      ...geoDataset,
      tableName: 'regions_geojson__simplified'
    });

    expect(mocks.createBasemapFromGeometryTable).toHaveBeenLastCalledWith(
      expect.anything(),
      'regions_geojson__simplified',
      expect.anything()
    );
    expect(mocks.setReferenceBasemap).toHaveBeenLastCalledWith(
      'regions_geojson__simplified'
    );
  });

  it('should reuse the derived tables instead of rebuilding them', async () => {
    await ensureDatasetGeometryBasemap(geoDataset);
    await ensureDatasetGeometryBasemap(geoDataset);

    expect(mocks.createBasemapFromGeometryTable).toHaveBeenCalledOnce();
  });

  it('should put the derived basemap back when the reference slot is freed', async () => {
    await ensureDatasetGeometryBasemap(geoDataset);
    mocks.setReferenceBasemap.mockClear();
    mocks.registerCustomBasemap.mockClear();

    await expect(activateDatasetGeometryBasemap()).resolves.toBe(true);
    expect(mocks.setReferenceBasemap).toHaveBeenCalledWith('regions_geojson');
  });

  it('should refuse to reclaim the slot once a real basemap holds it', async () => {
    await ensureDatasetGeometryBasemap(geoDataset);
    mocks.referenceBasemapId = 'france-regions-2025';
    mocks.getBasemapById.mockReturnValue(null);
    mocks.setReferenceBasemap.mockClear();

    await expect(activateDatasetGeometryBasemap()).resolves.toBe(false);
    expect(mocks.setReferenceBasemap).not.toHaveBeenCalled();
  });
});
