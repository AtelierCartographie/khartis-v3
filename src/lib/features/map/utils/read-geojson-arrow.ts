import {
  tableFromIPC,
  type Table as ArrowTable,
  Table,
  Schema,
  Field
} from 'apache-arrow/Arrow';
import { Duck } from '$lib/features/duckdb';
import { logger, LogCategory } from '../../commons/utils/logger';

function addGeoArrowMetadata(table: ArrowTable): ArrowTable {
  const geomColumn = table.schema.fields.find(
    (f) => f.name === 'geom' || f.name === 'geometry'
  );

  if (!geomColumn) {
    return table;
  }

  const geoColumnName = geomColumn.name;

  // Try to detect existing encoding from Arrow extension metadata
  const extensionName = geomColumn.metadata?.get('ARROW:extension:name');
  let encoding = 'WKB'; // Default fallback
  let geometryTypes = ['Polygon', 'MultiPolygon']; // Default

  if (extensionName) {
    if (extensionName.includes('geoarrow')) {
      // GeoArrow encoding detected
      encoding = extensionName; // e.g., 'geoarrow.polygon', 'geoarrow.point'

      // Infer geometry types from encoding
      if (extensionName.includes('point')) {
        geometryTypes = ['Point', 'MultiPoint'];
      } else if (extensionName.includes('line')) {
        geometryTypes = ['LineString', 'MultiLineString'];
      } else if (extensionName.includes('polygon')) {
        geometryTypes = ['Polygon', 'MultiPolygon'];
      }

    } else if (extensionName === 'ogc.wkb') {
      encoding = 'WKB';
    }
  }

  // Try to calculate bbox from actual data (only for first batch to avoid performance hit)
  const columnBounds: [number, number, number, number] = [-180, -90, 180, 90]; // Default world bounds

  // Note: Actual bbox calculation would require parsing geometry data
  // For now, use default bounds. Proper implementation would need DuckDB query.

  const geoMetadata = {
    version: '1.0.0',
    primary_column: geoColumnName,
    columns: {
      [geoColumnName]: {
        encoding,
        geometry_types: geometryTypes,
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


  const geojsonFile = new File([geojsonText], `${sanitizedName}.geojson`, {
    type: 'application/geo+json'
  });

  await Duck.register_files([geojsonFile]);

  const fileWithId = geojsonFile as File & { id?: string };
  const fileId =
    fileWithId.id || `${geojsonFile.lastModified}-${geojsonFile.name}`;

  const result = await Duck.query(`SELECT * FROM ST_Read('${fileId}')`, {
    format: 'arrow-ipc'
  });

  let table = tableFromIPC(result as Uint8Array);


  if (!table.schema.metadata.has('geo')) {
    table = addGeoArrowMetadata(table);
  }


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
