import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { GeoArrowMetadata } from '$lib/features/data-pipeline/models/geo-arrow-metadata';
import { Field, Schema, Table, Type, tableFromIPC } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';

export interface DuckDBClientForArrow {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  describe_table(
    tableName: string
  ): Promise<{ name: string[]; type: string[] }>;
  copy_to_geoparquet_as_buffer(tableName: string): Promise<Uint8Array>;
}

export async function fetchArrowTableWithGeometry(
  tableName: string,
  Duck: DuckDBClientForArrow
): Promise<Table> {
  const tableInfo = await Duck.describe_table(tableName);
  const columns = tableInfo.name.map((name: string, index: number) => ({
    column_name: name,
    column_type: tableInfo.type[index]
  }));

  const geomColumn = columns.find(
    (c: { column_type: string }) => c.column_type === 'GEOMETRY'
  );

  let query: string;
  if (geomColumn) {
    query = `SELECT * EXCLUDE ("${geomColumn.column_name}"), ST_AsWKB("${geomColumn.column_name}") AS "${geomColumn.column_name}" FROM "${tableName}"`;
  } else {
    query = `SELECT * FROM "${tableName}"`;
  }

  const buffer = (await Duck.query(query, {
    format: 'arrow-ipc' as never
  })) as ArrayBuffer | Uint8Array;

  const ipcBuffer =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  return tableFromIPC(ipcBuffer);
}

export async function fetchTableWithGeometryAsWkb(
  tableName: string,
  geometryColumn: string,
  Duck: DuckDBClientForArrow
): Promise<Table> {
  const buffer = (await Duck.query(
    `SELECT * REPLACE (
        ST_AsWKB("${geometryColumn}") AS "${geometryColumn}"
      )
      FROM "${tableName}"`,
    { format: 'arrow-ipc' as never }
  )) as ArrayBuffer | Uint8Array;

  const ipcBuffer =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return tableFromIPC(ipcBuffer);
}

export async function ensureGeometryColumnIsWkb(
  table: Table,
  tableName: string,
  geometryColumn: string,
  Duck: DuckDBClientForArrow
): Promise<Table> {
  const columnIndex = table.schema.fields.findIndex(
    (field) => field.name === geometryColumn
  );
  if (columnIndex === -1) {
    return table;
  }

  const vector = table.getChildAt(columnIndex);
  const sampleCount = Math.min(table.numRows, 5);
  for (let i = 0; i < sampleCount; i++) {
    const value = (vector?.get(i) as Uint8Array | null) ?? null;
    if (!value || value.length === 0) {
      continue;
    }
    const firstByte = value[0];
    if (firstByte === 0 || firstByte === 1) {
      return table;
    }
    break;
  }

  return fetchTableWithGeometryAsWkb(tableName, geometryColumn, Duck);
}

export async function addGeoArrowMetadataFromDuckDB(
  table: Table,
  tableName: string,
  Duck: DuckDBClientForArrow,
  cachedGeoArrowMetadata?: GeoArrowMetadata
): Promise<Table> {
  try {
    let geomColumn: { column_name: string; column_type: string } | undefined;
    let geometryType: string;

    if (cachedGeoArrowMetadata) {
      const primaryColumn = cachedGeoArrowMetadata.primary_column;
      geomColumn = { column_name: primaryColumn, column_type: 'GEOMETRY' };
      const columnMeta = cachedGeoArrowMetadata.columns[primaryColumn];
      geometryType = columnMeta?.geometry_types?.[0] || 'GEOMETRY';
      if (!geometryType.startsWith('ST_')) {
        geometryType = 'ST_' + geometryType;
      }

      logger.debug('Using cached geometry metadata', LogCategory.DUCKDB, {
        tableName,
        geometryType
      });
    } else {
      const tableInfo = await Duck.describe_table(tableName);
      const columns = tableInfo.name.map((name: string, index: number) => ({
        column_name: name,
        column_type: tableInfo.type[index]
      }));

      geomColumn = columns.find(
        (c: { column_type: string }) => c.column_type === 'GEOMETRY'
      );

      if (!geomColumn) {
        logger.warn(
          'No geometry column found in DuckDB table',
          LogCategory.DUCKDB,
          { tableName }
        );
        return table;
      }

      const geomTypeResult = (await Duck.query(
        `SELECT DISTINCT ST_GeometryType("${geomColumn.column_name}") as geom_type
         FROM "${tableName}"
         WHERE "${geomColumn.column_name}" IS NOT NULL`,
        { format: 'array' as never }
      )) as Array<{ geom_type: string }>;

      const types = geomTypeResult.map((r) => r.geom_type);

      if (types.length === 0) {
        geometryType = 'GEOMETRY';
      } else if (types.length === 1) {
        geometryType = types[0];
      } else {
        const hasPoint = types.some((t) => t === 'ST_Point' || t === 'POINT');
        const hasMultiPoint = types.some(
          (t) => t === 'ST_MultiPoint' || t === 'MULTIPOINT'
        );
        const hasLineString = types.some(
          (t) => t === 'ST_LineString' || t === 'LINESTRING'
        );
        const hasMultiLineString = types.some(
          (t) => t === 'ST_MultiLineString' || t === 'MULTILINESTRING'
        );
        const hasPolygon = types.some(
          (t) => t === 'ST_Polygon' || t === 'POLYGON'
        );
        const hasMultiPolygon = types.some(
          (t) => t === 'ST_MultiPolygon' || t === 'MULTIPOLYGON'
        );

        if (hasPolygon || hasMultiPolygon) {
          geometryType = 'MULTIPOLYGON';
        } else if (hasLineString || hasMultiLineString) {
          geometryType = 'MULTILINESTRING';
        } else if (hasPoint || hasMultiPoint) {
          geometryType = 'MULTIPOINT';
        } else {
          geometryType = 'GEOMETRY';
        }

        logger.info(
          'Mixed geometry types detected, normalized to Multi* variant',
          LogCategory.DUCKDB,
          { tableName, detectedTypes: types, normalizedType: geometryType }
        );
      }
    }

    const geomColumnIndex = table.schema.fields.findIndex(
      (f) => f.name === geomColumn!.column_name
    );
    const isGeoJsonString =
      geomColumnIndex !== -1 &&
      table.schema.fields[geomColumnIndex].typeId === Type.Utf8;

    const encoding = isGeoJsonString ? 'geojson' : 'ogc.wkb';

    const geoMetadata = {
      version: '1.0.0',
      primary_column: geomColumn!.column_name,
      columns: {
        [geomColumn!.column_name]: {
          encoding,
          geometry_types: [geometryType.replace('ST_', '')],
          crs: {
            type: 'name',
            properties: {
              name: 'EPSG:4326'
            }
          },
          bbox: [-180, -90, 180, 90]
        }
      }
    };

    let normalizedTable: Table;

    if (isGeoJsonString) {
      normalizedTable = table;
      logger.debug(
        'Geometry column is GeoJSON string, skipping WKB/GeoArrow conversion',
        LogCategory.DUCKDB,
        { tableName, columnName: geomColumn!.column_name }
      );
    } else {
      normalizedTable = await ensureGeometryColumnIsWkb(
        table,
        tableName,
        geomColumn!.column_name,
        Duck
      );
      logger.debug(
        'Geometry column is WKB binary, keeping as ogc.wkb encoding',
        LogCategory.DUCKDB,
        { tableName, columnName: geomColumn!.column_name }
      );
    }

    const schema = normalizedTable.schema;
    if (!schema) {
      logger.warn(
        'Arrow table missing schema, cannot add GeoArrow metadata',
        LogCategory.DUCKDB,
        { tableName }
      );
      return normalizedTable;
    }

    const newMetadata = schema.metadata
      ? new SvelteMap(schema.metadata)
      : new SvelteMap<string, string>();
    newMetadata.set('geo', JSON.stringify(geoMetadata));

    const updatedFields = (schema.fields ?? []).map((field) => {
      if (field.name !== geomColumn!.column_name) {
        return field;
      }
      const updatedMetadata = field.metadata
        ? new SvelteMap(field.metadata)
        : new SvelteMap<string, string>();
      updatedMetadata.set('ARROW:extension:name', encoding);
      updatedMetadata.set(
        'ARROW:extension:metadata',
        JSON.stringify({
          geometry_type: geometryType.replace('ST_', ''),
          crs: 'EPSG:4326'
        })
      );
      const fieldMetadataMap = new Map<string, string>(updatedMetadata);
      return new Field(
        field.name,
        field.type,
        field.nullable,
        fieldMetadataMap
      );
    });

    const metadataMap = new Map<string, string>(newMetadata);

    const newSchema = new Schema(updatedFields, metadataMap);

    const tableWithMetadata = new Table(newSchema, normalizedTable.batches);

    logger.debug('Added GeoArrow metadata to Arrow table', LogCategory.DUCKDB, {
      tableName,
      geometryType,
      encoding,
      hasSchemaMetadata: !!tableWithMetadata.schema.metadata,
      geoFieldMetadata: updatedFields.find(
        (f) => f.name === geomColumn!.column_name
      )?.metadata
    });

    return tableWithMetadata;
  } catch (error) {
    logger.error(
      'Failed to add GeoArrow metadata from DuckDB',
      LogCategory.DUCKDB,
      error
    );
    return table;
  }
}

export async function createArrowTableWithMetadata(
  tableName: string,
  Duck: DuckDBClientForArrow,
  extractMetadata: (table: Table) => GeoArrowMetadata | null
): Promise<{
  arrowTableWithMetadata: Table;
  geoArrowMetadata: GeoArrowMetadata | null;
}> {
  const arrowTable = await fetchArrowTableWithGeometry(tableName, Duck);
  const arrowTableWithMetadata = await addGeoArrowMetadataFromDuckDB(
    arrowTable,
    tableName,
    Duck
  );
  const geoArrowMetadata = extractMetadata(arrowTableWithMetadata);
  if (!geoArrowMetadata) {
    logger.warn(
      'GeoArrow metadata missing after conversion',
      LogCategory.DUCKDB,
      {
        tableName
      }
    );
  }
  return { arrowTableWithMetadata, geoArrowMetadata };
}

export async function exportTableToGeoParquet(
  tableName: string,
  Duck: DuckDBClientForArrow
): Promise<Uint8Array> {
  return Duck.copy_to_geoparquet_as_buffer(tableName);
}
