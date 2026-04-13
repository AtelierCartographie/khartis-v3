import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

const {
  convertGeoJSONToArrowMock,
  isGeoJSONFeatureCollectionMock,
  insertArrowTableIntoDuckDBMock
} = vi.hoisted(() => ({
  convertGeoJSONToArrowMock: vi.fn(),
  isGeoJSONFeatureCollectionMock: vi.fn(),
  insertArrowTableIntoDuckDBMock: vi.fn()
}));

vi.mock('$lib/features/commons/utils/geojson-to-arrow.utils', () => ({
  convertGeoJSONToArrow: convertGeoJSONToArrowMock
}));

vi.mock('$lib/types/data', () => ({
  isGeoJSONFeatureCollection: isGeoJSONFeatureCollectionMock
}));

vi.mock('$lib/features/duckdb/io/arrow-converter', () => ({
  insertArrowTableIntoDuckDB: insertArrowTableIntoDuckDBMock
}));

import { geojsonProcessor } from '$lib/features/data-pipeline/processors/strategies/geojson-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'map.geojson',
    size: 10,
    type: 'application/geo+json',
    fileType: FileType.GEOJSON,
    status: 'complete',
    sourceType: 'file_upload',
    parsedData: {
      type: 'FeatureCollection',
      features: []
    },
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_geo',
    Duck: {
      register_files: vi.fn().mockResolvedValue(undefined),
      read_geofile: vi.fn().mockResolvedValue('tbl_geo_actual'),
      analyse: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue(undefined)
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(3),
      createArrowTableWithMetadata: vi.fn().mockResolvedValue({
        arrowTableWithMetadata: { rows: 3 },
        geoArrowMetadata: { version: '1.1.0' }
      })
    }
  };
}

describe('geojsonProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGeoJSONFeatureCollectionMock.mockReturnValue(true);
    convertGeoJSONToArrowMock.mockReturnValue({ mock: 'arrow-table' });
    insertArrowTableIntoDuckDBMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('matches geojson/json files', () => {
    expect(geojsonProcessor.canHandle(file())).toBe(true);
    expect(geojsonProcessor.canHandle(file({ name: 'map.json' }))).toBe(true);
    expect(
      geojsonProcessor.canHandle(
        file({ fileType: FileType.CSV, name: 'data.csv' })
      )
    ).toBe(false);
  });

  it('uses ST_Read pipeline by default', async () => {
    const c = ctx();
    const result = await geojsonProcessor.process(c as never, file());

    expect(c.Duck.read_geofile).toHaveBeenCalledTimes(1);
    expect(insertArrowTableIntoDuckDBMock).not.toHaveBeenCalled();
    expect(result.tableName).toBe('tbl_geo_actual');
  });

  it('falls back to legacy mode when ST_Read fails', async () => {
    const c = ctx();
    c.Duck.read_geofile
      .mockRejectedValueOnce(new Error('stread failed'))
      .mockResolvedValueOnce('tbl_geo');

    const result = await geojsonProcessor.process(c as never, file());

    expect(c.Duck.read_geofile).toHaveBeenCalledTimes(2);
    expect(result.tableName).toBe('tbl_geo');
  });

  it('uses Arrow pipeline when configured and ST_Read disabled', async () => {
    vi.stubEnv('VITE_USE_ST_READ', 'false');
    vi.stubEnv('VITE_USE_ARROW_GEOJSON', 'true');

    const c = ctx();
    const result = await geojsonProcessor.process(c as never, file());

    expect(insertArrowTableIntoDuckDBMock).toHaveBeenCalledWith(
      { mock: 'arrow-table' },
      'tbl_geo'
    );
    expect(c.Duck.query).toHaveBeenCalledTimes(2);
    expect(c.callbacks.createArrowTableWithMetadata).not.toHaveBeenCalled();
    expect(result.arrowTableWithMetadata).toBeUndefined();
  });

  it('falls back from Arrow validation failure to legacy pipeline', async () => {
    vi.stubEnv('VITE_USE_ST_READ', 'false');
    vi.stubEnv('VITE_USE_ARROW_GEOJSON', 'true');

    isGeoJSONFeatureCollectionMock.mockReturnValue(false);

    const c = ctx();
    const result = await geojsonProcessor.process(c as never, file());

    expect(c.Duck.read_geofile).toHaveBeenCalledTimes(1);
    expect(result.tableName).toBe('tbl_geo');
  });
});
