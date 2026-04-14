import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  datasetsStore: {
    datasets: [] as unknown[]
  },
  exportProcessedDatasets: vi.fn(),
  downloadFile: vi.fn(),
  generateExportFilename: vi.fn(() => 'joined-export.geojson'),
  normalizeDatasets: vi.fn((datasets) => datasets),
  duckQuery: vi.fn(),
  getDatasetBySourceFile: vi.fn(),
  loadGeometryIntoDuckDB: vi.fn()
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    currentProject: undefined
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: mocks.datasetsStore
}));

vi.mock('$lib/features/commons/store/map-instance.store.svelte', () => ({
  mapInstanceStore: {
    isMapLoaded: true
  }
}));

vi.mock('$lib/features/commons/utils/file-export.utils', () => ({
  exportProcessedDatasets: mocks.exportProcessedDatasets,
  downloadFile: mocks.downloadFile,
  generateExportFilename: mocks.generateExportFilename
}));

vi.mock('$lib/features/commons/utils/map-export.utils', () => ({
  exportMapToSvg: vi.fn(),
  exportMapToJpg: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/utils/processed-dataset.utils', () => ({
  normalizeDatasets: mocks.normalizeDatasets
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    EXPORT: 'EXPORT'
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: mocks.duckQuery
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: mocks.getDatasetBySourceFile
  }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    loadGeometryIntoDuckDB: mocks.loadGeometryIntoDuckDB
  }
}));

import { COLUMN_TYPE_GEOMETRY } from '$lib/features/commons/constants/data.constants';
import {
  FileFormatEnum,
  type ProcessedDataset
} from '$lib/features/data-pipeline/types';
import { DATA_FORMAT } from '$lib/features/header/types';
import { exportData } from '$lib/features/header/services/export.service';

function createDataset(
  overrides: Partial<ProcessedDataset> = {}
): ProcessedDataset {
  return {
    id: 'dataset-1',
    name: 'Joined dataset',
    sourceFileId: 'source-1',
    format: FileFormatEnum.CSV,
    data: [{ basemap_id: 'FR', value: 10 }],
    rowCount: 1,
    columns: [
      {
        name: 'basemap_id',
        type: 'string',
        nullable: false,
        unique: false
      },
      {
        name: 'value',
        type: 'number',
        nullable: true,
        unique: false
      }
    ],
    analysis: {
      columns: [],
      geoColumns: [],
      hasGeoData: false,
      rowCount: 1,
      warnings: []
    },
    duckdbTableName: 'dataset_table',
    createdAt: new Date('2026-04-03T00:00:00.000Z'),
    fileSize: 123,
    metadata: {
      processedAt: new Date('2026-04-03T00:00:00.000Z'),
      transformations: []
    },
    ...overrides
  };
}

describe('export.service geometry exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.datasetsStore.datasets = [];
    mocks.exportProcessedDatasets.mockResolvedValue(new Blob(['{}']));
    mocks.getDatasetBySourceFile.mockReset();
    mocks.loadGeometryIntoDuckDB.mockReset();
    mocks.duckQuery.mockReset();
  });

  it('casts joined basemap geometries to GEOMETRY before GeoJSON export', async () => {
    mocks.datasetsStore.datasets = [
      createDataset({
        duckdbTableName: 'render_view_without_join_key'
      })
    ];
    mocks.getDatasetBySourceFile.mockReturnValue({
      joinedBasemap: 'monde-countries-2024-medium',
      tableName: 'joined_source_table'
    });
    mocks.loadGeometryIntoDuckDB.mockResolvedValue(
      'basemap_geom_monde_countries_2024_medium'
    );
    mocks.duckQuery
      .mockResolvedValueOnce([
        { column_name: 'id', data_type: 'VARCHAR' },
        { column_name: 'geom', data_type: 'GEOMETRY' }
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          basemap_id: 'FR',
          value: 10,
          geom: [
            [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
              { x: 0, y: 0 }
            ]
          ]
        }
      ]);

    await exportData('joined-export', DATA_FORMAT.GEOJSON);

    expect(mocks.loadGeometryIntoDuckDB).toHaveBeenCalledWith(
      'monde-countries-2024-medium'
    );
    expect(mocks.duckQuery).toHaveBeenCalledTimes(3);
    expect(mocks.duckQuery.mock.calls[1]?.[0]).toContain(
      'SELECT d.*, g.geom AS geom'
    );
    expect(mocks.duckQuery.mock.calls[1]?.[0]).toContain(
      'FROM "joined_source_table" d'
    );
    expect(mocks.duckQuery.mock.calls[1]?.[0]).toContain(
      'INNER JOIN "basemap_geom_monde_countries_2024_medium" g'
    );
    expect(mocks.exportProcessedDatasets).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          geometry: 'Polygon',
          data: [
            expect.objectContaining({
              geom: expect.objectContaining({ type: 'Polygon' })
            })
          ],
          columns: expect.arrayContaining([
            expect.objectContaining({
              name: 'geom',
              type: COLUMN_TYPE_GEOMETRY
            })
          ])
        })
      ],
      DATA_FORMAT.GEOJSON
    );
    expect(mocks.downloadFile).toHaveBeenCalledWith(
      expect.any(Blob),
      'joined-export.geojson'
    );
  });

  it('casts native geometry columns to GEOMETRY before GeoJSON export', async () => {
    mocks.datasetsStore.datasets = [
      createDataset({
        id: 'dataset-2',
        name: 'Geo dataset',
        format: FileFormatEnum.GEOJSON,
        geometry: 'Polygon',
        sourceFileId: undefined,
        data: [],
        columns: [
          {
            name: 'name',
            type: 'string',
            nullable: false,
            unique: false
          },
          {
            name: 'geom',
            type: COLUMN_TYPE_GEOMETRY,
            nullable: true,
            unique: false
          }
        ],
        duckdbTableName: 'geo_dataset_table'
      })
    ];
    mocks.duckQuery.mockResolvedValueOnce([
      {
        name: 'France',
        geom: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 0 }
          ]
        ]
      }
    ]);

    await exportData('geo-export', DATA_FORMAT.GEOJSON);

    expect(mocks.duckQuery).toHaveBeenCalledTimes(1);
    expect(mocks.duckQuery.mock.calls[0]?.[0]).toBe(
      'SELECT * FROM "geo_dataset_table"'
    );
    expect(mocks.exportProcessedDatasets).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          data: [
            expect.objectContaining({
              geom: expect.objectContaining({ type: 'Polygon' })
            })
          ]
        })
      ],
      DATA_FORMAT.GEOJSON
    );
  });
});
