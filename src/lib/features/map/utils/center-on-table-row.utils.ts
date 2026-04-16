import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import { basemapService } from '../services/basemap.service.svelte';
import { resolveCenterCoordinates } from './orthographic-center.utils';

interface CenterOnTableRowOptions {
  tableName: string;
  rowId: number;
  sourceFileId?: string;
  joinedBasemap?: string;
  gpsColumns?: {
    lat: string;
    lon: string;
  };
}

interface InformationSchemaColumn {
  column_name: string;
  data_type: string;
}

interface CenterLookupRow {
  basemap_id: string | number | null;
  lon: number | null;
  lat: number | null;
}

const GEOMETRY_COLUMN_NAME_PATTERN = /^(geom|geometry|wkb_geometry|the_geom)$/i;
const TEXT_COLUMN_TYPES = new Set(['VARCHAR', 'TEXT', 'STRING']);

function isGeometryColumn(column: InformationSchemaColumn): boolean {
  return (
    GEOMETRY_COLUMN_NAME_PATTERN.test(column.column_name) ||
    column.data_type.toUpperCase().startsWith('GEOMETRY')
  );
}

function findGeometryColumn(
  columns: InformationSchemaColumn[]
): string | undefined {
  return columns.find(isGeometryColumn)?.column_name;
}

function findFeatureIdentifierColumn(
  columns: InformationSchemaColumn[]
): string | undefined {
  const featureIdColumn = columns.find(
    (column) => column.column_name === INTERNAL_COLUMN.FEATURE_ID
  );
  if (featureIdColumn) {
    return featureIdColumn.column_name;
  }

  const nativeIdColumn = columns.find(
    (column) =>
      column.column_name.toLowerCase() === 'id' && !isGeometryColumn(column)
  );
  return nativeIdColumn?.column_name;
}

function getTextColumns(columns: InformationSchemaColumn[]): string[] {
  return columns
    .filter(
      (column) =>
        !isGeometryColumn(column) &&
        TEXT_COLUMN_TYPES.has(column.data_type.toUpperCase())
    )
    .map((column) => column.column_name);
}

function buildRepresentativePointExpression(escapedColumn: string): string {
  return `CASE
    WHEN ${escapedColumn} IS NULL OR ST_IsEmpty(${escapedColumn}) THEN NULL
    WHEN CAST(ST_GeometryType(${escapedColumn}) AS VARCHAR) IN ('POLYGON', 'MULTIPOLYGON') THEN
      CASE
        WHEN NOT ST_IsValid(${escapedColumn}) THEN ST_PointOnSurface(${escapedColumn})
        ELSE COALESCE(
          ST_MaximumInscribedCircle(${escapedColumn}).center,
          ST_PointOnSurface(${escapedColumn})
        )
      END
    ELSE ST_PointOnSurface(${escapedColumn})
  END`;
}

async function getTableColumns(
  tableName: string
): Promise<InformationSchemaColumn[]> {
  return (await Duck.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(tableName)}'
     ORDER BY ordinal_position`,
    { format: 'array', useProxy: false }
  )) as InformationSchemaColumn[];
}

async function getDatasetRowCenterData(
  tableName: string,
  rowId: number
): Promise<CenterLookupRow | null> {
  const columns = await getTableColumns(tableName);
  const geometryColumn = findGeometryColumn(columns);
  const hasBasemapId = columns.some(
    (column) => column.column_name === 'basemap_id'
  );

  if (!geometryColumn && !hasBasemapId) {
    return null;
  }

  const escapedTable = escapeIdentifier(tableName);
  const representativePoint = geometryColumn
    ? buildRepresentativePointExpression(
        `"${escapeIdentifier(geometryColumn)}"`
      )
    : 'NULL';
  const basemapSelect = hasBasemapId ? 'basemap_id' : 'NULL AS basemap_id';

  const rows = (await Duck.query(
    `WITH centered_row AS (
       SELECT
         ${basemapSelect},
         ${representativePoint} AS representative_point
       FROM "${escapedTable}"
       WHERE ${INTERNAL_COLUMN.ID} = ${rowId}
       LIMIT 1
     )
     SELECT
       basemap_id,
       ST_X(representative_point) AS lon,
       ST_Y(representative_point) AS lat
     FROM centered_row`,
    { format: 'array', useProxy: false }
  )) as CenterLookupRow[];

  return rows?.[0] ?? null;
}

async function getGpsCenter(
  tableName: string,
  rowId: number,
  gpsColumns: CenterOnTableRowOptions['gpsColumns']
): Promise<CenterLookupRow | null> {
  if (!gpsColumns?.lat || !gpsColumns?.lon) {
    return null;
  }

  const escapedTable = escapeIdentifier(tableName);
  const escapedLat = escapeIdentifier(gpsColumns.lat);
  const escapedLon = escapeIdentifier(gpsColumns.lon);

  const rows = (await Duck.query(
    `SELECT
       NULL AS basemap_id,
       TRY_CAST("${escapedLon}" AS DOUBLE) AS lon,
       TRY_CAST("${escapedLat}" AS DOUBLE) AS lat
     FROM "${escapedTable}"
     WHERE ${INTERNAL_COLUMN.ID} = ${rowId}
     LIMIT 1`,
    { format: 'array', useProxy: false }
  )) as CenterLookupRow[];

  return rows?.[0] ?? null;
}

async function getBasemapFeatureCenter(
  joinedBasemap: string,
  basemapFeatureId: string | number
): Promise<CenterLookupRow | null> {
  await basemapService.initialize();
  const geometryTableName =
    await basemapService.loadGeometryIntoDuckDB(joinedBasemap);
  const columns = await getTableColumns(geometryTableName);
  const geometryColumn = findGeometryColumn(columns);

  if (!geometryColumn) {
    return null;
  }

  const escapedGeometryTable = escapeIdentifier(geometryTableName);
  const escapedGeometryColumn = escapeIdentifier(geometryColumn);
  const representativePoint = buildRepresentativePointExpression(
    `"${escapedGeometryColumn}"`
  );
  const escapedFeatureId = escapeSqlString(String(basemapFeatureId));
  const featureIdentifierColumn = findFeatureIdentifierColumn(columns);

  let whereClause = '';

  if (featureIdentifierColumn) {
    whereClause = `CAST("${escapeIdentifier(featureIdentifierColumn)}" AS VARCHAR) = '${escapedFeatureId}'`;
  } else {
    const textColumns = getTextColumns(columns);
    if (textColumns.length === 0) {
      return null;
    }

    whereClause = textColumns
      .map(
        (columnName) =>
          `CAST("${escapeIdentifier(columnName)}" AS VARCHAR) = '${escapedFeatureId}'`
      )
      .join(' OR ');
  }

  const rows = (await Duck.query(
    `WITH centered_feature AS (
       SELECT ${representativePoint} AS representative_point
       FROM "${escapedGeometryTable}"
       WHERE ${whereClause}
       LIMIT 1
     )
     SELECT
       NULL AS basemap_id,
       ST_X(representative_point) AS lon,
       ST_Y(representative_point) AS lat
     FROM centered_feature
     WHERE representative_point IS NOT NULL`,
    { format: 'array', useProxy: false }
  )) as CenterLookupRow[];

  return rows?.[0] ?? null;
}

async function applyCenter(
  row: CenterLookupRow | null,
  sourceFileId?: string
): Promise<boolean> {
  if (!row || row.lon == null || row.lat == null) {
    return false;
  }

  if (!Number.isFinite(row.lon) || !Number.isFinite(row.lat)) {
    return false;
  }

  const center = await resolveCenterCoordinates({
    lon: row.lon,
    lat: row.lat,
    sourceFileId
  });

  mapInstanceStore.centerOnDataPoint(center.x, center.y);
  return true;
}

export async function centerMapOnTableRow({
  tableName,
  rowId,
  sourceFileId,
  joinedBasemap,
  gpsColumns
}: CenterOnTableRowOptions): Promise<void> {
  if (!Number.isFinite(rowId)) return;

  try {
    const datasetCenter = await getDatasetRowCenterData(tableName, rowId);
    if (await applyCenter(datasetCenter, sourceFileId)) {
      return;
    }

    const gpsCenter = await getGpsCenter(tableName, rowId, gpsColumns);
    if (await applyCenter(gpsCenter, sourceFileId)) {
      return;
    }

    const basemapFeatureId = datasetCenter?.basemap_id;
    if (!joinedBasemap || basemapFeatureId == null) {
      return;
    }

    const basemapCenter = await getBasemapFeatureCenter(
      joinedBasemap,
      basemapFeatureId
    );
    await applyCenter(basemapCenter, sourceFileId);
  } catch (error) {
    logger.debug('Failed to center map on table row', LogCategory.UI, {
      rowId,
      tableName,
      joinedBasemap,
      error
    });
  }
}
