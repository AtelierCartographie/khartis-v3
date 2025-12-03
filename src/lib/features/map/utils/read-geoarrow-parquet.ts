import {
  tableFromIPC,
  type Table as ArrowTable,
  Table,
  Schema,
  Field
} from 'apache-arrow/Arrow';
import initParquetWasm, {
  readParquet as wasmReadParquet
} from 'parquet-wasm/esm/parquet_wasm.js';
import parquetWasmUrl from 'parquet-wasm/esm/parquet_wasm_bg.wasm?url';

let parquetInitialized = false;

async function ensureWasmInitialized(): Promise<void> {
  if (!parquetInitialized) {
    await initParquetWasm({ module_or_path: parquetWasmUrl });
    parquetInitialized = true;
  }
}

function detectGeoArrowType(
  field: Field,
  geoMetadataHint?: { geometryType?: string }
): string | null {
  const existingExtension = field.metadata?.get('ARROW:extension:name');
  if (existingExtension) {
    return existingExtension;
  }

  const typeStr = field.type.toString();

  // Native GeoArrow nested list structures
  if (typeStr.includes('List<List<List<List<')) {
    return 'geoarrow.multipolygon';
  }
  if (typeStr.includes('List<List<List<')) {
    return 'geoarrow.polygon';
  }
  if (typeStr.includes('List<List<')) {
    const innerType = typeStr.toLowerCase();
    if (innerType.includes('struct') && innerType.includes('float')) {
      return 'geoarrow.linestring';
    }
  }
  if (typeStr.includes('Struct<')) {
    const innerType = typeStr.toLowerCase();
    if (
      innerType.includes('float') &&
      (innerType.includes('x') || innerType.includes('y'))
    ) {
      return 'geoarrow.point';
    }
  }

  // WKB-encoded geometry (Binary type) - common in GeoParquet
  if (typeStr === 'Binary' || typeStr.includes('Binary')) {
    // Use hint from geo metadata if available
    if (geoMetadataHint?.geometryType) {
      const geomType = geoMetadataHint.geometryType.toLowerCase();
      if (geomType.includes('multipolygon')) return 'geoarrow.multipolygon';
      if (geomType.includes('polygon')) return 'geoarrow.polygon';
      if (geomType.includes('multilinestring'))
        return 'geoarrow.multilinestring';
      if (geomType.includes('linestring')) return 'geoarrow.linestring';
      if (geomType.includes('multipoint')) return 'geoarrow.multipoint';
      if (geomType.includes('point')) return 'geoarrow.point';
    }
    // Default to multipolygon for basemaps (most common case)
    return 'geoarrow.multipolygon';
  }

  return null;
}

function addGeoArrowMetadataToParquet(table: ArrowTable): ArrowTable {
  const geomField = table.schema.fields.find(
    (f) => f.name === 'geom' || f.name === 'geometry'
  );

  if (!geomField) {
    return table;
  }

  const geoColumnName = geomField.name;
  const detectedType = detectGeoArrowType(geomField);

  if (!detectedType) {
    return table;
  }

  let geometryTypes: string[];
  if (detectedType.includes('multipolygon')) {
    geometryTypes = ['MultiPolygon'];
  } else if (detectedType.includes('polygon')) {
    geometryTypes = ['Polygon'];
  } else if (detectedType.includes('multilinestring')) {
    geometryTypes = ['MultiLineString'];
  } else if (detectedType.includes('linestring')) {
    geometryTypes = ['LineString'];
  } else if (detectedType.includes('multipoint')) {
    geometryTypes = ['MultiPoint'];
  } else if (detectedType.includes('point')) {
    geometryTypes = ['Point'];
  } else {
    geometryTypes = ['Polygon', 'MultiPolygon'];
  }

  const geoMetadata = {
    version: '1.0.0',
    primary_column: geoColumnName,
    columns: {
      [geoColumnName]: {
        encoding: detectedType,
        geometry_types: geometryTypes,
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

  const newFields = table.schema.fields.map((field) => {
    if (field.name === geoColumnName) {
      const newMetadata = new Map(field.metadata || []);
      newMetadata.set('ARROW:extension:name', detectedType);
      return new Field(field.name, field.type, field.nullable, newMetadata);
    }
    return new Field(field.name, field.type, field.nullable, field.metadata);
  });

  const newSchemaMetadata = new Map(table.schema.metadata || []);
  newSchemaMetadata.set('geo', JSON.stringify(geoMetadata));

  const newSchema = new Schema(newFields, newSchemaMetadata);
  const newTable = new Table(newSchema, table.batches);

  return newTable;
}

export async function readGeoArrowParquet(
  arrayBuffer: ArrayBuffer
): Promise<ArrowTable> {
  await ensureWasmInitialized();

  const wasmTable = wasmReadParquet(new Uint8Array(arrayBuffer));
  const arrowIPC = wasmTable.intoIPCStream();
  let jsTable = tableFromIPC(arrowIPC);

  // Always check if field-level extension metadata exists
  // GeoParquet has schema-level 'geo' metadata, but @geoarrow/deck.gl-layers
  // requires field-level 'ARROW:extension:name' metadata
  const geomField = jsTable.schema.fields.find(
    (f) => f.name === 'geom' || f.name === 'geometry'
  );
  const hasFieldExtension = geomField?.metadata?.has('ARROW:extension:name');

  if (!hasFieldExtension) {
    jsTable = addGeoArrowMetadataToParquet(jsTable);
  }

  return jsTable;
}
