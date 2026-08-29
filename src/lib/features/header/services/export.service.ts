import {
  exportProcessedDatasets,
  downloadFile,
  generateExportFilename
} from '$lib/features/commons/utils/file-export.utils';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages';
import { DATA_FORMAT, type DataExportFormat } from '../types';
import { Duck, duckDBOrchestrator, initDuckDB } from '$lib/features/duckdb';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { parseGeoJsonGeometry } from '$lib/features/map/io/geometry-parser';
import { resolveGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';
import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import {
  COLUMN_TYPE_GEOMETRY,
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN
} from '$lib/features/commons/constants/data.constants';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { isDatasetGeometryColumn } from '$lib/features/commons/utils/geometry-column.utils';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import {
  exportGeoPackageLayers,
  type GeoPackageLayerExportOptions,
  type GeoPackageFeatureRow
} from '$lib/features/commons/utils/geopackage-export.utils';
import { normalizeProj4CrsCode } from '$lib/features/commons/utils/proj4-crs.utils';
import {
  exportMapToSvg,
  exportMapToJpg
} from '$lib/features/commons/utils/map-export.utils';
import { normalizeDatasets } from '$lib/features/data-pipeline';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/pipeline.errors';
import { shouldUseGpsGeometryExport } from './export-source-selection';

export class ExportError extends Error {
  title: string;

  constructor(title: string, message: string) {
    super(message);
    this.name = 'ExportError';
    this.title = title;
    Error.captureStackTrace?.(this, ExportError);
  }
}

interface JoinedGeometryExportSource {
  joinedBasemap: string;
  tableName?: string;
}

interface GeoPackageExportSource {
  layerName: string;
  sourceCrs: string | null;
  propertyColumns: string[];
  tempViewName?: string;
  buildSelect: () => string;
}

const WGS84_CRS = 'EPSG:4326';
const GEOPACKAGE_WKB_COLUMN = '__khartis_wkb_geometry';

const EXPORT_PAGE_SELECTOR = '.page-container, .facets-page';
const EXPORT_MAP_CANVAS_SELECTOR =
  '.map-canvas canvas, .shared-facets-canvas canvas, canvas';

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

  const normalizedDatasets = normalizeDatasets(datasetsStore.datasets);
  let blob: Blob;
  let extension: string;

  if (format === DATA_FORMAT.GEOPACKAGE) {
    blob = await exportDatasetsToGeoPackage(normalizedDatasets);
    extension = 'gpkg';
  } else {
    const formatConfig = getDataFormatConfig(format);
    blob = await exportProcessedDatasets(
      format === DATA_FORMAT.GEOJSON
        ? await fetchDatasetsWithGeometry(normalizedDatasets)
        : normalizedDatasets,
      formatConfig.format
    );
    extension = formatConfig.extension;
  }

  const filename = generateExportFilename(fileName, extension);

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

  const pageContainer = document.querySelector(EXPORT_PAGE_SELECTOR);
  const canvas = pageContainer?.querySelector(EXPORT_MAP_CANVAS_SELECTOR);

  return (
    canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0
  );
}

function getDataFormatConfig(format: Exclude<DataExportFormat, 'geopackage'>): {
  format: Exclude<DataExportFormat, 'geopackage'>;
  extension: string;
} {
  switch (format) {
    case DATA_FORMAT.CSV:
      return { format: DATA_FORMAT.CSV, extension: DATA_FORMAT.CSV };
    case DATA_FORMAT.GEOJSON:
      return { format: DATA_FORMAT.GEOJSON, extension: DATA_FORMAT.GEOJSON };
  }
}

function resolveDatasetGeometryColumn(
  dataset: ProcessedDataset
): ProcessedDataset['columns'][0] | undefined {
  return dataset.columns.find((column) =>
    isDatasetGeometryColumn(dataset, column)
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

function resolveDuckDataset(dataset: ProcessedDataset) {
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

  return candidates.find(Boolean);
}

function resolveOriginalDataset(
  dataset: ProcessedDataset
): DatasetResult | undefined {
  return datasetsStore.datasets.find(
    (candidate) =>
      candidate.id === dataset.id ||
      candidate.sourceFileId === dataset.sourceFileId ||
      candidate.tableName === dataset.duckdbTableName
  );
}

function resolveDatasetGeometryCrs(dataset: ProcessedDataset): string | null {
  const originalDataset = resolveOriginalDataset(dataset);
  return normalizeCrsName(originalDataset?.geometry?.crs) ?? null;
}

function normalizeCrsName(crs: string | null | undefined): string | null {
  const trimmed = crs?.trim();
  if (!trimmed) {
    return null;
  }

  if (isWgs84LikeCrs(trimmed)) {
    return WGS84_CRS;
  }

  return normalizeProj4CrsCode(trimmed);
}

function isWgs84LikeCrs(crs: string | null | undefined): boolean {
  if (!crs) {
    return false;
  }

  const normalized = crs.trim();
  return (
    /^EPSG:4326$/i.test(normalized) ||
    /^urn:ogc:def:crs:EPSG::4326$/i.test(normalized) ||
    /(^|:)CRS84$/i.test(normalized)
  );
}

function resolveDatasetGpsColumns(dataset: ProcessedDataset): {
  lat: string;
  lon: string;
} | null {
  const duckDataset = resolveDuckDataset(dataset);
  if (duckDataset?.gpsColumns) {
    return duckDataset.gpsColumns;
  }

  return resolveGPSCoordinateColumns(
    dataset.columns.map((column) => ({ name: column.name })),
    dataset.geoDetection
  );
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
  duckDBType: string | null,
  sourceCrs: string | null = null
): string {
  const escapedName = escapeIdentifier(columnName);
  const geometryExpression = buildGeometryValueExpression(
    columnName,
    duckDBType,
    { sourceCrs, targetCrs: WGS84_CRS }
  );
  return `ST_AsGeoJSON(${geometryExpression}) AS "${escapedName}"`;
}

function buildGeometryValueExpression(
  columnName: string,
  duckDBType: string | null,
  options: { sourceCrs?: string | null; targetCrs?: string | null } = {}
): string {
  const escapedName = escapeIdentifier(columnName);
  const normalizedType = duckDBType?.replace(/\s+/g, ' ').toUpperCase() ?? '';
  let expression: string;

  if (normalizedType.startsWith('GEOMETRY')) {
    expression = `"${escapedName}"::GEOMETRY`;
  } else if (normalizedType === 'BLOB' || normalizedType.includes('WKB')) {
    expression = `ST_GeomFromWKB("${escapedName}")`;
  } else {
    expression = `"${escapedName}"`;
  }

  const sourceCrs = normalizeCrsName(options.sourceCrs);
  const targetCrs = normalizeCrsName(options.targetCrs);
  if (sourceCrs && targetCrs && sourceCrs !== targetCrs) {
    return `ST_Transform(${expression}, '${escapeSqlString(sourceCrs)}', '${escapeSqlString(targetCrs)}', true)`;
  }

  return expression;
}

function buildGpsGeometryValueExpression(gpsColumns: {
  lat: string;
  lon: string;
}): string {
  const escapedLat = escapeIdentifier(gpsColumns.lat);
  const escapedLon = escapeIdentifier(gpsColumns.lon);
  const latValue = `TRY_CAST("${escapedLat}" AS DOUBLE)`;
  const lonValue = `TRY_CAST("${escapedLon}" AS DOUBLE)`;

  return `CASE
    WHEN ${latValue} BETWEEN -90 AND 90
      AND ${lonValue} BETWEEN -180 AND 180
    THEN ST_Point(${lonValue}, ${latValue})::GEOMETRY
    ELSE NULL
  END`;
}

function createTempName(prefix: string, value: string = ''): string {
  const safeValue = value.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${safeValue}_${Date.now()}_${suffix}`;
}

function buildPrefixedColumnSelect(
  columns: ProcessedDataset['columns'],
  prefix: string
): string {
  return columns
    .map((column) => {
      const escapedName = escapeIdentifier(column.name);
      return `${prefix}."${escapedName}" AS "${escapedName}"`;
    })
    .join(', ');
}

function buildAlignedPropertySelect(
  allPropertyColumns: string[],
  availablePropertyColumns: string[],
  sourcePrefix: string = ''
): string {
  const available = new Set(availablePropertyColumns);
  return allPropertyColumns
    .map((columnName) => {
      const escapedName = escapeIdentifier(columnName);
      return available.has(columnName)
        ? `${sourcePrefix}"${escapedName}" AS "${escapedName}"`
        : `NULL AS "${escapedName}"`;
    })
    .join(', ');
}

function normalizeWkbValue(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

const BASEMAP_ID_EXPORT_COLUMN = 'basemap_id';

interface BasemapIdentityColumn {
  sourceColumn: string;
  exportName: string;
}

function resolveBasemapIdentityColumn(
  dataset: ProcessedDataset,
  nativeIdColumnName: string | null
): BasemapIdentityColumn | null {
  if (!nativeIdColumnName) {
    return null;
  }
  const existing = new Set(dataset.columns.map((c) => c.name));
  let exportName = BASEMAP_ID_EXPORT_COLUMN;
  let suffix = 1;
  while (existing.has(exportName)) {
    exportName = `${BASEMAP_ID_EXPORT_COLUMN}_${suffix}`;
    suffix += 1;
  }
  return { sourceColumn: nativeIdColumnName, exportName };
}

async function createJoinedGeometryExportView(options: {
  dataset: ProcessedDataset;
  joinedBasemapId: string;
  sourceTableName?: string;
  viewName: string;
  geometryExpression: (geometrySql: string) => string;
}): Promise<BasemapIdentityColumn | null> {
  const datasetTableName =
    options.sourceTableName ?? options.dataset.duckdbTableName;
  if (!datasetTableName) {
    throw new DataValidationError(
      'Missing DuckDB source table for joined export',
      'duckdbTableName',
      { datasetId: options.dataset.id }
    );
  }

  const geometryTable = await basemapService.loadGeometryIntoDuckDB(
    options.joinedBasemapId
  );

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
  const datasetColumns = buildPrefixedColumnSelect(
    options.dataset.columns,
    'd'
  );
  const basemapIdentity = resolveBasemapIdentityColumn(
    options.dataset,
    nativeIdColumn?.column_name ?? null
  );
  const basemapIdSelectFrom = (alias: string): string =>
    basemapIdentity
      ? `, CAST(${alias}."${escapeIdentifier(basemapIdentity.sourceColumn)}" AS VARCHAR) AS "${escapeIdentifier(basemapIdentity.exportName)}"`
      : '';

  if (featureIdColumn || nativeIdColumn) {
    const joinColumn =
      featureIdColumn?.column_name ?? nativeIdColumn?.column_name;
    if (!joinColumn) {
      throw new Error('Unreachable: join column presence already verified');
    }
    const escapedJoinCol = escapeIdentifier(joinColumn);
    await Duck.query(`
      CREATE OR REPLACE TEMP VIEW "${options.viewName}" AS
      SELECT ${datasetColumns}${basemapIdSelectFrom('g')}, ${options.geometryExpression('g.geom::GEOMETRY')} AS geom
      FROM "${escapedGeometry}" g
      LEFT JOIN "${escapedDataset}" d
        ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(g."${escapedJoinCol}" AS VARCHAR)
      WHERE g.geom IS NOT NULL
    `);
    return basemapIdentity;
  }

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

  if (textColumns.length === 0) {
    await Duck.query(`
      CREATE OR REPLACE TEMP VIEW "${options.viewName}" AS
      SELECT ${datasetColumns}${basemapIdSelectFrom('g')}, ${options.geometryExpression('g.geom::GEOMETRY')} AS geom
      FROM "${escapedGeometry}" g
      LEFT JOIN "${escapedDataset}" d ON FALSE
      WHERE g.geom IS NOT NULL
    `);
    return basemapIdentity;
  }

  const colList = textColumns
    .map((c) => `"${escapeIdentifier(c.column_name)}"`)
    .join(', ');

  const unpivotBasemapIdSelect = basemapIdentity
    ? `, CAST(gu._attr_val AS VARCHAR) AS "${escapeIdentifier(basemapIdentity.exportName)}"`
    : '';

  await Duck.query(`
    CREATE OR REPLACE TEMP VIEW "${options.viewName}" AS
    WITH geometry_rows AS (
      SELECT ROW_NUMBER() OVER () AS _geometry_row_id, *
      FROM "${escapedGeometry}"
    ),
    geom_unpivot AS (
      UNPIVOT geometry_rows
      ON ${colList}
      INTO NAME _attr_col VALUE _attr_val
    )
    SELECT ${datasetColumns}${unpivotBasemapIdSelect}, ${options.geometryExpression('gu.geom::GEOMETRY')} AS geom
    FROM geom_unpivot gu
    LEFT JOIN "${escapedDataset}" d
      ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(gu._attr_val AS VARCHAR)
    WHERE gu.geom IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY gu._geometry_row_id
      ORDER BY CASE WHEN d."${escapedBasemapIdCol}" IS NULL THEN 1 ELSE 0 END
    ) = 1
  `);
  return basemapIdentity;
}

async function fetchJoinedDatasetWithGeometry(
  dataset: ProcessedDataset,
  joinedBasemapId: string,
  sourceTableName?: string
): Promise<ProcessedDataset> {
  const viewName = createTempName(
    'export_joined',
    sourceTableName ?? dataset.duckdbTableName ?? dataset.id
  );

  const basemapIdentity = await createJoinedGeometryExportView({
    dataset,
    joinedBasemapId,
    sourceTableName,
    viewName,
    geometryExpression: (geometrySql) => `ST_AsGeoJSON(${geometrySql})`
  });

  const rows = (await Duck.query(`SELECT * FROM "${viewName}"`, {
    format: 'array'
  })) as Record<string, unknown>[];

  await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`).catch(() => {});

  const allColumnNames = [
    ...dataset.columns.map((c) => c.name),
    ...(basemapIdentity ? [basemapIdentity.exportName] : []),
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

  const basemapIdentityColumn = basemapIdentity
    ? ({
        name: basemapIdentity.exportName,
        type: 'string',
        label: basemapIdentity.exportName,
        originalType: 'VARCHAR',
        nullable: false,
        unique: false
      } as (typeof dataset.columns)[0])
    : null;

  return {
    ...dataset,
    geometry: 'Polygon',
    data: dataWithParsedGeometry,
    columns: [
      ...dataset.columns,
      ...(basemapIdentityColumn ? [basemapIdentityColumn] : []),
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

async function fetchGpsDatasetWithGeometry(
  dataset: ProcessedDataset,
  gpsColumns: { lat: string; lon: string }
): Promise<ProcessedDataset> {
  if (!dataset.duckdbTableName) {
    throw new DataValidationError(
      'Missing DuckDB source table for GPS export',
      'duckdbTableName',
      { datasetId: dataset.id }
    );
  }

  const geometryColumnName = INTERNAL_COLUMN.GEOM;
  const geometryExpression = buildGpsGeometryValueExpression(gpsColumns);
  const selectList = [
    ...dataset.columns.map((column) => `"${escapeIdentifier(column.name)}"`),
    `ST_AsGeoJSON(${geometryExpression}) AS "${geometryColumnName}"`
  ].join(', ');
  const query = `SELECT ${selectList} FROM "${escapeIdentifier(dataset.duckdbTableName)}"`;

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
    const geomValue = row[geometryColumnName];
    newRow[geometryColumnName] = parseGeoJsonGeometry(geomValue);
    return newRow;
  });

  return {
    ...dataset,
    geometry: 'Point',
    data: dataWithParsedGeometry,
    columns: [
      ...dataset.columns,
      {
        name: geometryColumnName,
        type: COLUMN_TYPE_GEOMETRY,
        label: geometryColumnName,
        originalType: 'GEOMETRY',
        nullable: true,
        unique: false
      } as (typeof dataset.columns)[0]
    ]
  };
}

async function buildJoinedGeoPackageExportSource(
  dataset: ProcessedDataset,
  joinedGeometrySource: JoinedGeometryExportSource
): Promise<GeoPackageExportSource> {
  const viewName = createTempName(
    'export_joined_gpkg',
    joinedGeometrySource.tableName ?? dataset.duckdbTableName ?? dataset.id
  );

  const basemapIdentity = await createJoinedGeometryExportView({
    dataset,
    joinedBasemapId: joinedGeometrySource.joinedBasemap,
    sourceTableName: joinedGeometrySource.tableName,
    viewName,
    geometryExpression: (geometrySql) => geometrySql
  });

  const propertyColumns = [
    ...dataset.columns.map((column) => column.name),
    ...(basemapIdentity ? [basemapIdentity.exportName] : [])
  ];
  return {
    layerName: dataset.name,
    sourceCrs: WGS84_CRS,
    propertyColumns,
    tempViewName: viewName,
    buildSelect: () => {
      const propertySelect = buildAlignedPropertySelect(
        propertyColumns,
        propertyColumns
      );
      const selectColumns = [
        propertySelect,
        `ST_AsWKB("geom"::GEOMETRY) AS "${GEOPACKAGE_WKB_COLUMN}"`
      ].filter(Boolean);
      return `SELECT ${selectColumns.join(', ')} FROM "${viewName}" WHERE "geom" IS NOT NULL`;
    }
  };
}

async function buildDirectGeoPackageExportSource(
  dataset: ProcessedDataset,
  geomColumn: ProcessedDataset['columns'][0]
): Promise<GeoPackageExportSource | null> {
  if (!dataset.duckdbTableName) {
    return null;
  }

  const geometryDuckDBType = await getDuckDBColumnType(
    dataset.duckdbTableName,
    geomColumn.name
  );
  const sourceCrs = resolveDatasetGeometryCrs(dataset);
  const targetCrs = sourceCrs ?? WGS84_CRS;
  const geometryExpression = buildGeometryValueExpression(
    geomColumn.name,
    geometryDuckDBType,
    { sourceCrs, targetCrs }
  );
  const propertyColumns = dataset.columns
    .filter((column) => column.name !== geomColumn.name)
    .map((column) => column.name);
  const escapedTable = escapeIdentifier(dataset.duckdbTableName);

  return {
    layerName: dataset.name,
    sourceCrs: targetCrs,
    propertyColumns,
    buildSelect: () => {
      const propertySelect = buildAlignedPropertySelect(
        propertyColumns,
        propertyColumns
      );
      const selectColumns = [
        propertySelect,
        `ST_AsWKB(${geometryExpression}) AS "${GEOPACKAGE_WKB_COLUMN}"`
      ].filter(Boolean);
      return `SELECT ${selectColumns.join(', ')} FROM "${escapedTable}" WHERE ${geometryExpression} IS NOT NULL`;
    }
  };
}

function buildGpsGeoPackageExportSource(
  dataset: ProcessedDataset,
  gpsColumns: { lat: string; lon: string }
): GeoPackageExportSource | null {
  if (!dataset.duckdbTableName) {
    return null;
  }

  const geometryExpression = buildGpsGeometryValueExpression(gpsColumns);
  const propertyColumns = dataset.columns.map((column) => column.name);
  const escapedTable = escapeIdentifier(dataset.duckdbTableName);

  return {
    layerName: dataset.name,
    sourceCrs: WGS84_CRS,
    propertyColumns,
    buildSelect: () => {
      const propertySelect = buildAlignedPropertySelect(
        propertyColumns,
        propertyColumns
      );
      const selectColumns = [
        propertySelect,
        `ST_AsWKB(${geometryExpression}) AS "${GEOPACKAGE_WKB_COLUMN}"`
      ].filter(Boolean);
      return `SELECT ${selectColumns.join(', ')} FROM "${escapedTable}" WHERE ${geometryExpression} IS NOT NULL`;
    }
  };
}

async function buildGeoPackageExportSource(
  dataset: ProcessedDataset
): Promise<GeoPackageExportSource | null> {
  const geomColumn = resolveDatasetGeometryColumn(dataset);
  const joinedGeometrySource = resolveJoinedGeometryExportSource(dataset);
  const gpsColumns = resolveDatasetGpsColumns(dataset);
  const duckDataset = resolveDuckDataset(dataset);

  if (geomColumn) {
    return buildDirectGeoPackageExportSource(dataset, geomColumn);
  }

  if (
    gpsColumns &&
    shouldUseGpsGeometryExport({
      hasGeometryColumn: false,
      hasJoinedGeometry: Boolean(joinedGeometrySource),
      hasGpsColumns: true,
      gpsMode: duckDataset?.gpsMode
    })
  ) {
    return buildGpsGeoPackageExportSource(dataset, gpsColumns);
  }

  if (joinedGeometrySource) {
    return buildJoinedGeoPackageExportSource(dataset, joinedGeometrySource);
  }

  return null;
}

async function exportDatasetsToGeoPackage(
  datasets: ProcessedDataset[]
): Promise<Blob> {
  await initDuckDB();
  if (!Duck.db) {
    throw new DuckDBError(m.error_duckdb_not_initialized());
  }

  const sources = (
    await Promise.all(
      datasets.map((dataset) => buildGeoPackageExportSource(dataset))
    )
  ).filter((source): source is GeoPackageExportSource => Boolean(source));

  if (sources.length === 0) {
    throw new DataValidationError(
      m.error_no_geometric_data_export(),
      'geometry',
      { format: DATA_FORMAT.GEOPACKAGE }
    );
  }

  try {
    const layers: GeoPackageLayerExportOptions[] = [];
    for (const source of sources) {
      const rows = (await Duck.query(source.buildSelect(), {
        format: 'array'
      })) as Record<string, unknown>[];
      const features: GeoPackageFeatureRow[] = rows.flatMap((row) => {
        const wkb = normalizeWkbValue(row[GEOPACKAGE_WKB_COLUMN]);
        if (!wkb) {
          return [];
        }

        const properties: Record<string, unknown> = {};
        for (const columnName of source.propertyColumns) {
          properties[columnName] = row[columnName];
        }

        return [{ properties, wkb }];
      });

      if (features.length > 0) {
        layers.push({
          layerName: source.layerName,
          sourceCrs: source.sourceCrs,
          features
        });
      }
    }

    if (layers.length === 0) {
      throw new DataValidationError(
        m.error_no_geometric_data_export(),
        'geometry',
        { format: DATA_FORMAT.GEOPACKAGE }
      );
    }

    return exportGeoPackageLayers(layers);
  } finally {
    await Promise.all(
      sources
        .flatMap((source) => (source.tempViewName ? [source.tempViewName] : []))
        .map((viewName) =>
          Duck.query(`DROP VIEW IF EXISTS "${viewName}"`).catch(() => {})
        )
    );
  }
}

async function fetchDatasetsWithGeometry(
  datasets: ProcessedDataset[]
): Promise<ProcessedDataset[]> {
  const results: ProcessedDataset[] = [];

  for (const dataset of datasets) {
    const geomColumn = resolveDatasetGeometryColumn(dataset);
    const joinedGeometrySource = resolveJoinedGeometryExportSource(dataset);
    const gpsColumns = resolveDatasetGpsColumns(dataset);
    const duckDataset = resolveDuckDataset(dataset);
    const shouldExportGps = shouldUseGpsGeometryExport({
      hasGeometryColumn: Boolean(geomColumn),
      hasJoinedGeometry: Boolean(joinedGeometrySource),
      hasGpsColumns: Boolean(gpsColumns),
      gpsMode: duckDataset?.gpsMode
    });

    if (shouldExportGps && dataset.duckdbTableName && gpsColumns) {
      try {
        results.push(await fetchGpsDatasetWithGeometry(dataset, gpsColumns));
      } catch (error) {
        logger.error(
          'Failed to fetch GPS geometry for export',
          LogCategory.EXPORT,
          {
            datasetId: dataset.id,
            tableName: dataset.duckdbTableName,
            error: error instanceof Error ? error.message : String(error)
          },
          { feature: 'export', flow: 'fetch_gps_geometry' }
        );
        results.push(dataset);
      }
      continue;
    }

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
          },
          { feature: 'export', flow: 'fetch_joined_geometry' }
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
      const sourceCrs = resolveDatasetGeometryCrs(dataset);
      const selectList = dataset.columns
        .map((column) => {
          const escapedName = escapeIdentifier(column.name);
          if (column.name === geomColumn.name) {
            return buildGeometryExportSelect(
              column.name,
              geometryDuckDBType,
              sourceCrs
            );
          }
          return `"${escapedName}"`;
        })
        .join(', ');

      const query = `SELECT ${selectList} FROM "${escapeIdentifier(dataset.duckdbTableName)}"`;

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
        },
        { feature: 'export', flow: 'fetch_geometry_duckdb' }
      );
      results.push(dataset);
    }
  }

  return results;
}
