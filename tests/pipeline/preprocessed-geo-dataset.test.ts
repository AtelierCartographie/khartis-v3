import { describe, expect, it, vi } from 'vitest';
import {
  DataSourceType,
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import { DuckDBSimplifiedType } from '$lib/features/duckdb';

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {},
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const { createDatasetFromPreprocessedFile } =
  await import('$lib/features/commons/stores/datasets/datasets-processing');
const { cleanFileForStorage } =
  await import('$lib/features/commons/stores/project/project-files');
const { buildStatisticsFromColumns, enrichColumns } =
  await import('$lib/features/data-pipeline/operations/analysis');

const geometry = {
  type: 'MULTIPOLYGON',
  columnName: 'geom',
  bounds: [-5.14, 41.21, 9.56, 51.09] as [number, number, number, number],
  centroid: [2.21, 46.15] as [number, number],
  crs: 'OGC:CRS84',
  featureCount: 34879
};

function makeModalGeoFile(): UploadedFile {
  return {
    id: 'communes',
    name: 'fr-com2025-wgs84.parquet',
    size: 13_303_457,
    type: 'application/vnd.apache.parquet',
    fileType: FileType.GEOPARQUET,
    status: FileStatus.COMPLETE,
    sourceType: DataSourceType.URL,
    content: new ArrayBuffer(8),
    parsedData: [{ codgeo: '01001', libgeo: "L'Abergement-Clémenciat" }],
    statistics: {
      codgeo: { type: 'text', count: 34879, nullCount: 0, unique: 34877 }
    },
    duckdbTableName: 'fr_com2025_wgs84_table',
    geometry
  };
}

describe('geo dataset created from the import modal', () => {
  it('keeps the modal geometry through project creation', () => {
    expect(cleanFileForStorage(makeModalGeoFile()).geometry).toEqual(geometry);
  });

  it('reuses the modal table and its geometry instead of a GeoJSON snapshot', () => {
    const dataset = createDatasetFromPreprocessedFile(makeModalGeoFile());

    expect(dataset.tableName).toBe('fr_com2025_wgs84_table');
    expect(dataset.geometry).toEqual(geometry);
    expect(dataset.rowCount).toBe(34879);
    expect(dataset.analysis?.hasGeoData).toBe(true);
    expect(dataset.bounds).toEqual({
      minLon: -5.14,
      minLat: 41.21,
      maxLon: 9.56,
      maxLat: 51.09
    });
  });
});

describe('column statistics from the import modal', () => {
  it('should keep every statistic the suggester reads when the project is created from the modal', () => {
    const [column] = enrichColumns([
      {
        name: 'pib',
        type_simple: DuckDBSimplifiedType.NUMERIC,
        count: 10,
        nulls: 0,
        uniques: 10,
        min: 120n,
        max: 25_000n,
        share_integers: 1,
        share_floats: 0,
        share_rank_interval: 0.1,
        extent_magnitude: 2.3,
        skewness: 2.4,
        value_sample: [120, 25_000]
      }
    ]);
    const dataset = createDatasetFromPreprocessedFile({
      ...makeModalGeoFile(),
      statistics: buildStatisticsFromColumns([column])
    });

    expect(dataset.columns[0].stats).toEqual(column.stats);
  });
});
