import {
  tableFromIPC,
  type Table as ArrowTable,
  Table,
  Schema,
  Field
} from 'apache-arrow/Arrow';
import { Duck } from '../../commons/services/duckdb/duckdb';
import { logger, LogCategory } from '../../commons/utils/logger';

function addGeoArrowMetadata(table: ArrowTable): ArrowTable {
  const geomColumn = table.schema.fields.find(
    (f) => f.name === 'geom' || f.name === 'geometry'
  );

  if (!geomColumn) {
    logger.warn('No geometry column found in table', LogCategory.MAP);
    return table;
  }

  const geoColumnName = geomColumn.name;

  const columnBounds = [-180, -90, 180, 90];

  const geoMetadata = {
    version: '1.0.0',
    primary_column: geoColumnName,
    columns: {
      [geoColumnName]: {
        encoding: 'WKB',
        geometry_types: ['Polygon', 'MultiPolygon'],
        crs: {
          type: 'name',
          properties: {
            name: 'EPSG:4326'
          }
        },
        bbox: columnBounds
      }
    }
  };

  const newMetadata = new Map(table.schema.metadata);
  newMetadata.set('geo', JSON.stringify(geoMetadata));

  const newFields = table.schema.fields.map(
    (field) => new Field(field.name, field.type, field.nullable, field.metadata)
  );

  const newSchema = new Schema(newFields, newMetadata);
  const newTable = new Table(newSchema, table.batches);

  logger.info('Added GeoArrow metadata to table', LogCategory.MAP, {
    geoColumn: geoColumnName,
    bbox: columnBounds
  });

  return newTable;
}

export async function readGeoJSONAsArrow(
  geojsonText: string,
  tableName: string
): Promise<ArrowTable> {
  if (!Duck) {
    throw new Error('DuckDB not initialized');
  }

  const sanitizedName = tableName
    .replace(/dataset_/g, '')
    .replace(/-/g, '_')
    .replace('.geojson', '');

  logger.info('Reading GeoJSON with ST_Read', LogCategory.MAP, {
    originalTableName: tableName,
    sanitizedName
  });

  const geojsonFile = new File([geojsonText], `${sanitizedName}.geojson`, {
    type: 'application/geo+json'
  });

  await Duck.register_files([geojsonFile]);

  const fileWithId = geojsonFile as any;
  const fileId =
    fileWithId.id || `${geojsonFile.lastModified}-${geojsonFile.name}`;

  const result = await Duck.query(`SELECT * FROM ST_Read('${fileId}')`, {
    format: 'arrow-ipc'
  });

  let table = tableFromIPC(result as Uint8Array);

  logger.info('GeoJSON loaded, adding GeoArrow metadata', LogCategory.MAP, {
    rowCount: table.numRows,
    hasGeoMetadata: table.schema.metadata.has('geo')
  });

  if (!table.schema.metadata.has('geo')) {
    table = addGeoArrowMetadata(table);
  }

  logger.info('GeoJSON successfully converted to Arrow', LogCategory.MAP, {
    rowCount: table.numRows,
    hasGeoMetadata: table.schema.metadata.has('geo'),
    columns: table.schema.fields.map((f: any) => f.name)
  });

  return table;
}

export async function readDuckDBTableAsArrow(
  tableName: string
): Promise<ArrowTable> {
  if (!Duck) {
    throw new Error('DuckDB not initialized');
  }

  const result = await Duck.query(`SELECT * FROM "${tableName}"`, {
    format: 'arrow-ipc'
  });

  const table = tableFromIPC(result as Uint8Array);
  return table;
}
