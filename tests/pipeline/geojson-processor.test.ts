import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

const { isGeoJSONFeatureCollectionMock } = vi.hoisted(() => ({
  isGeoJSONFeatureCollectionMock: vi.fn()
}));

vi.mock('$lib/types/data', () => ({
  isGeoJSONFeatureCollection: isGeoJSONFeatureCollectionMock
}));

import { geojsonProcessor } from '$lib/features/data-pipeline/processors/strategies/geojson-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'geo.geojson',
    size: 100,
    type: 'application/geo+json',
    fileType: FileType.GEOJSON,
    status: 'complete',
    sourceType: 'file_upload',
    content: JSON.stringify({ type: 'FeatureCollection', features: [] }),
    parsedData: { type: 'FeatureCollection', features: [] },
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
      insertArrowTableIntoDuckDB: vi.fn().mockResolvedValue(undefined)
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(3),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('geojsonProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('canHandle matches geojson by fileType or .geojson/.json extension', () => {
    expect(geojsonProcessor.canHandle(file())).toBe(true);
    expect(
      geojsonProcessor.canHandle(
        file({ name: 'data.json', fileType: FileType.GEOJSON })
      )
    ).toBe(true);
    expect(
      geojsonProcessor.canHandle(
        file({ name: 'data.csv', fileType: FileType.CSV })
      )
    ).toBe(false);
  });

  it('processes via ST_Read path when USE_ST_READ succeeds', async () => {
    isGeoJSONFeatureCollectionMock.mockReturnValue(false);
    const c = ctx();
    const result = await geojsonProcessor.process(c as never, file());
    expect(c.Duck.register_files).toHaveBeenCalledOnce();
    expect(c.Duck.read_geofile).toHaveBeenCalledOnce();
    expect(result.tableName).toBe('tbl_geo_actual');
    expect(result.rowCount).toBe(3);
  });
});
