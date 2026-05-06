import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import {
  exportProcessedDatasets,
  downloadFile,
  generateExportFilename
} from '$lib/features/commons/utils/file-export.utils';
import {
  exportMapToSvg,
  exportMapToJpg
} from '$lib/features/commons/utils/map-export.utils';
import { normalizeDatasets } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages.js';
import { DATA_FORMAT, type DataExportFormat } from '../types';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { parseGeoJsonGeometry } from '$lib/features/map/io/geometry-parser';
import type { ProcessedDataset } from '$lib/features/data-pipeline/types';
import {
  COLUMN_TYPE_GEOMETRY,
  CANONICAL_ID_COLUMN,
  GEO_COLUMN_NAMES,
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN
} from '$lib/features/commons/constants/data.constants';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';

export interface ExportError extends Error {
  title: string;
}

interface ExportErrorConstructor {
  new (title: string, message: string): ExportError;
  readonly prototype: ExportError;
}

interface JoinedGeometryExportSource {
  joinedBasemap: string;
  tableName?: string;
}

export const ExportError: ExportErrorConstructor = function ExportError(
  this: ExportError,
  title: string,
  message: string
): ExportError {
  const error = new Error(message) as ExportError;
  Object.setPrototypeOf(error, ExportError.prototype);
  error.name = 'ExportError';
  error.title = title;
  Error.captureStackTrace?.(error, ExportError);
  return error;
} as unknown as ExportErrorConstructor;

Object.setPrototypeOf(ExportError.prototype, Error.prototype);

export async function exportProject(fileName: string): Promise<void> {
  if (!projectStore.currentProject) {
    return;
  }

  await projectStore.exportProject(fileName);
}

export async function exportMapAsSvg(
  fileName: string,
  width: number = 1920,
  height: number = 1080
): Promise<void> {
  validateMapExportPrerequisites();

  const blob = await exportMapToSvg({ width, height });
  const filename = generateExportFilename(fileName, 'svg');

  downloadFile(blob, filename);
}

export async function exportMapAsJpg(
  fileName: string,
  width: number = 1920,
  height: number = 1080
): Promise<void> {
  validateMapExportPrerequisites();

  const blob = await exportMapToJpg({ width, height });
  const filename = generateExportFilename(fileName, 'jpg');

  downloadFile(blob, filename);
}

export async function exportData(
  fileName: string,
  format: DataExportFormat
): Promise<void> {
  if (datasetsStore.datasets.length === 0) {
    throw new ExportError(m.export_data_error(), m.export_data_no_data());
  }

  const formatConfig = getDataFormatConfig(format);
  const normalizedDatasets = normalizeDatasets(datasetsStore.datasets);

  const datasetsToExport =
    format === DATA_FORMAT.CSV_GEO || format === DATA_FORMAT.GEOJSON
      ? await fetchDatasetsWithGeometry(normalizedDatasets)
      : normalizedDatasets;

  const blob = await exportProcessedDatasets(
    datasetsToExport,
    formatConfig.format
  );
  const filename = generateExportFilename(fileName, formatConfig.extension);

  downloadFile(blob, filename);
}

function validateMapExportPrerequisites(): void {
  if (!mapInstanceStore.isMapLoaded && !hasRenderableMapOutput()) {
    throw new ExportError(m.export_map_error(), m.export_map_not_loaded());
  }

  if (datasetsStore.datasets.length === 0) {
    throw new ExportError(m.export_map_error(), m.export_map_no_data());
  }
}

function hasRenderableMapOutput(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const pageContainer = document.querySelector('.page-container');
  const canvas = pageContainer?.querySelector('canvas');

  return (
    canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0
  );
}

function getDataFormatConfig(format: DataExportFormat): {
  format: DataExportFormat;
  extension: string;
} {
  switch (format) {
    case DATA_FORMAT.CSV:
      return { format: DATA_FORMAT.CSV, extension: DATA_FORMAT.CSV };
    case DATA_FORMAT.GEOJSON:
      return { format: DATA_FORMAT.GEOJSON, extension: DATA_FORMAT.GEOJSON };
    case DATA_FORMAT.CSV_GEO:
      return { format: DATA_FORMAT.CSV_GEO, extension: DATA_FORMAT.CSV };
  }
}

function isGeometryColumnName(name: string): boolean {
  return (GEO_COLUMN_NAMES as readonly string[]).includes(name.toLowerCase());
}

function resolveDatasetGeometryColumn(
  dataset: ProcessedDataset
): ProcessedDataset['columns'][0] | undefined {
  return dataset.columns.find(
    (column) =>
      column.type === COLUMN_TYPE_GEOMETRY ||
      ((Boolean(dataset.geometry) || dataset.analysis.hasGeoData) &&
        isGeometryColumnName(column.name))
  );
}

function resolveJoinedGeometryExportSource(
  dataset: ProcessedDataset
): JoinedGeometryExportSource | null {
  const candidates = [
    dataset.sourceFileId
      ? duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
      : undefined,
    duckDBOrchestrator.getDatasetById(dataset.id),
    duckDBOrchestrator.getDataset(dataset.id),
    dataset.duckdbTableName
      ? duckDBOrchestrator.getDatasetByTable(dataset.duckdbTableName)
      : undefined
  ];

  const duckDataset = candidates.find((candidate) =>
    Boolean(candidate?.joinedBasemap)
  );
  if (!duckDataset?.joinedBasemap) {
    return null;
  }

  return {
    joinedBasemap: duckDataset.joinedBasemap,
    tableName: duckDataset.tableName
  };
}

async function getDuckDBColumnType(
  tableName: string,
  columnName: string
): Promise<string | null> {
  const rows = (await Duck.query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(tableName)}'
       AND column_name = '${escapeSqlString(columnName)}'
     LIMIT 1`,
    { format: 'array' }
  )) as Array<{ data_type: string }>;

  return rows[0]?.data_type ?? null;
}

function buildGeometryExportSelect(
  columnName: string,
  duckDBType: string | null
): string {
  const escapedName = escapeIdentifier(columnName);
  const normalizedType = duckDBType?.replace(/\s+/g, ' ').toUpperCase() ?? '';

  if (normalizedType.startsWith('GEOMETRY')) {
    return `ST_AsGeoJSON("${escapedName}") AS "${escapedName}"`;
  }

  if (normalizedType === 'BLOB' || normalizedType.includes('WKB')) {
    return `ST_AsGeoJSON(ST_GeomFromWKB("${escapedName}")) AS "${escapedName}"`;
  }

  return `"${escapedName}"`;
}

async function fetchJoinedDatasetWithGeometry(
  dataset: ProcessedDataset,
  joinedBasemapId: string,
  sourceTableName?: string
): Promise<ProcessedDataset> {
  const datasetTableName = sourceTableName ?? dataset.duckdbTableName;
  if (!datasetTableName) {
    throw new Error('Missing DuckDB source table for joined export');
  }

  const geometryTable =
    await basemapService.loadGeometryIntoDuckDB(joinedBasemapId);

  const geomColumnsFull = (await Duck.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(geometryTable)}'`,
    { format: 'array' }
  )) as Array<{ column_name: string; data_type: string }>;

  const featureIdColumn = geomColumnsFull.find(
    (c) => c.column_name === INTERNAL_COLUMN.FEATURE_ID
  );
  const nativeIdColumn = geomColumnsFull.find(
    (c) => c.column_name.toLowerCase() === CANONICAL_ID_COLUMN
  );
  const escapedDataset = escapeIdentifier(datasetTableName);
  const escapedGeometry = escapeIdentifier(geometryTable);
  const escapedBasemapIdCol = escapeIdentifier(JOINED_BASEMAP_COLUMN.ID);
  const viewName = `export_joined_${datasetTableName.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  if (featureIdColumn || nativeIdColumn) {
    const joinColumn =
      featureIdColumn?.column_name ?? nativeIdColumn?.column_name;
    if (!joinColumn) {
      throw new Error('Unreachable: join column presence already verified');
    }
    const escapedJoinCol = escapeIdentifier(joinColumn);
    await Duck.query(`
      CREATE OR REPLACE TEMP VIEW "${viewName}" AS
      SELECT d.*, ST_AsGeoJSON(g.geom::GEOMETRY) AS geom
      FROM "${escapedDataset}" d
      INNER JOIN "${escapedGeometry}" g
        ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(g."${escapedJoinCol}" AS VARCHAR)
      WHERE g.geom IS NOT NULL
    `);
  } else {
    const textColumns = geomColumnsFull.filter((c) => {
      const name = c.column_name;
      const type = c.data_type.toUpperCase();
      if (
        name === INTERNAL_COLUMN.GEOM ||
        name === INTERNAL_COLUMN.GEOMETRY ||
        name === INTERNAL_COLUMN.WKB_GEOMETRY ||
        name === INTERNAL_COLUMN.THE_GEOM
      ) {
        return false;
      }
      return type === 'VARCHAR' || type === 'TEXT';
    });

    const colList = textColumns
      .map((c) => `"${escapeIdentifier(c.column_name)}"`)
      .join(', ');

    await Duck.query(`
      CREATE OR REPLACE TEMP VIEW "${viewName}" AS
      WITH geom_unpivot AS (
        UNPIVOT "${escapedGeometry}"
        ON ${colList}
        INTO NAME _attr_col VALUE _attr_val
      )
      SELECT d.*, ST_AsGeoJSON(gu.geom::GEOMETRY) AS geom
      FROM "${escapedDataset}" d
      INNER JOIN (
      SELECT DISTINCT _attr_val, geom
      FROM geom_unpivot
    ) gu
      ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(gu._attr_val AS VARCHAR)
      WHERE gu.geom IS NOT NULL
    `);
  }

  const rows = (await Duck.query(`SELECT * FROM "${viewName}"`, {
    format: 'array'
  })) as Record<string, unknown>[];

  // DuckDB Arrow rows have non-enumerable properties — must copy by explicit column name
  const allColumnNames = [
    ...dataset.columns.map((c) => c.name),
    INTERNAL_COLUMN.GEOM
  ];

  const dataWithParsedGeometry = rows.map((row) => {
    const newRow: Record<string, unknown> = {};
    for (const colName of allColumnNames) {
      newRow[colName] = row[colName];
    }
    const geomValue = newRow[INTERNAL_COLUMN.GEOM];
    const parsedGeometry = parseGeoJsonGeometry(geomValue);
    if (parsedGeometry) {
      newRow[INTERNAL_COLUMN.GEOM] = parsedGeometry;
    } else if (geomValue != null) {
      newRow[INTERNAL_COLUMN.GEOM] = null;
    }
    return newRow;
  });

  return {
    ...dataset,
    geometry: 'Polygon',
    data: dataWithParsedGeometry,
    columns: [
      ...dataset.columns,
      {
        name: INTERNAL_COLUMN.GEOM,
        type: COLUMN_TYPE_GEOMETRY,
        label: INTERNAL_COLUMN.GEOM,
        originalType: 'GEOMETRY',
        nullable: true,
        unique: false
      } as (typeof dataset.columns)[0]
    ]
  };
}

async function fetchDatasetsWithGeometry(
  datasets: ProcessedDataset[]
): Promise<ProcessedDataset[]> {
  const results: ProcessedDataset[] = [];

  for (const dataset of datasets) {
    const geomColumn = resolveDatasetGeometryColumn(dataset);
    const joinedGeometrySource = resolveJoinedGeometryExportSource(dataset);
    if (joinedGeometrySource && !geomColumn) {
      try {
        const joinedDataset = await fetchJoinedDatasetWithGeometry(
          dataset,
          joinedGeometrySource.joinedBasemap,
          joinedGeometrySource.tableName
        );
        results.push(joinedDataset);
      } catch (error) {
        logger.error(
          'Failed to fetch joined geometry for export',
          LogCategory.EXPORT,
          {
            datasetId: dataset.id,
            joinedBasemap: joinedGeometrySource.joinedBasemap,
            error: error instanceof Error ? error.message : String(error)
          }
        );
        results.push(dataset);
      }
      continue;
    }

    if (
      !dataset.duckdbTableName ||
      (!dataset.geometry && !dataset.analysis.hasGeoData)
    ) {
      results.push(dataset);
      continue;
    }

    if (!geomColumn) {
      results.push(dataset);
      continue;
    }

    try {
      const geometryDuckDBType = await getDuckDBColumnType(
        dataset.duckdbTableName,
        geomColumn.name
      );
      const selectList = dataset.columns
        .map((column) => {
          const escapedName = escapeIdentifier(column.name);
          if (column.name === geomColumn.name) {
            return buildGeometryExportSelect(column.name, geometryDuckDBType);
          }
          return `"${escapedName}"`;
        })
        .join(', ');

      const query = `SELECT ${selectList} FROM "${dataset.duckdbTableName}"`;

      const rows = (await Duck.query(query, { format: 'array' })) as Record<
        string,
        unknown
      >[];

      const columnNames = dataset.columns.map((c) => c.name);
      const dataWithParsedGeometry = rows.map((row) => {
        const newRow: Record<string, unknown> = {};
        for (const colName of columnNames) {
          newRow[colName] = row[colName];
        }
        const geomValue = newRow[geomColumn.name];
        const parsedGeometry = parseGeoJsonGeometry(geomValue);
        if (parsedGeometry) {
          newRow[geomColumn.name] = parsedGeometry;
        } else if (geomValue != null) {
          newRow[geomColumn.name] = null;
        }
        return newRow;
      });

      results.push({
        ...dataset,
        columns: dataset.columns.map((column) =>
          column.name === geomColumn.name
            ? { ...column, type: COLUMN_TYPE_GEOMETRY }
            : column
        ),
        data: dataWithParsedGeometry
      });
    } catch (error) {
      logger.error(
        'Failed to fetch geometry data from DuckDB',
        LogCategory.EXPORT,
        {
          datasetId: dataset.id,
          tableName: dataset.duckdbTableName,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      results.push(dataset);
    }
  }

  return results;
}
