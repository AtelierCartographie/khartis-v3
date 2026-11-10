import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import * as m from '$lib/paraglide/messages';
import { MIME } from '../constants';
import { DataValidationError, PipelineError } from '../pipeline.errors';
import { escapeIdentifier } from './sanitize.utils';

type SqliteModule = Awaited<ReturnType<typeof sqlite3InitModule>>;
type SqliteDatabase = InstanceType<SqliteModule['oo1']['DB']>;

export interface GeoPackageFeatureRow {
  properties: Record<string, unknown>;
  wkb: Uint8Array;
}

export interface GeoPackageExportOptions {
  layerName: string;
  sourceCrs: string | null;
  /** A CRS without EPSG code, described by its WKT. */
  customSrs?: { name: string; definition: string };
}

/** A QGIS style applied to the layer on opening (`layer_styles`). */
export interface GeoPackageLayerStyle {
  name: string;
  qml: string;
  description?: string;
}

export interface GeoPackageLayerExportOptions extends GeoPackageExportOptions {
  features: GeoPackageFeatureRow[];
  style?: GeoPackageLayerStyle;
  /** Columns in this order, typed by their values; others follow. */
  propertyColumns?: string[];
  /**
   * Columns holding ISO dates (`YYYY-MM-DD`) or date-times, declared as such
   * so GIS software reads them as dates rather than text.
   */
  columnTypes?: Record<string, 'DATE' | 'DATETIME'>;
}

interface GeoPackagePropertyColumnMapping {
  sourceName: string;
  columnName: string;
}

const GEOPACKAGE_GEOMETRY_COLUMN = 'geom';
const GEOPACKAGE_ID_COLUMN = 'fid';
const GEOPACKAGE_LAYER_NAME_MAX_LENGTH = 48;
const GEOPACKAGE_EXPORT_DB_CLOSED_ERROR_CODE = 'GEOPACKAGE_EXPORT_DB_CLOSED';
const SQLITE_APPLICATION_ID_GEOPACKAGE = 1196444487;
const SQLITE_USER_VERSION_GEOPACKAGE_1_2 = 10200;
const GEOPACKAGE_RESERVED_COLUMN_NAMES = new Set([
  GEOPACKAGE_ID_COLUMN,
  GEOPACKAGE_GEOMETRY_COLUMN
]);
const EPSG_WKT_DEFINITIONS: Record<number, string> = {
  3857: 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1]]',
  2154: 'PROJCS["RGF93 / Lambert-93",GEOGCS["RGF93",DATUM["Reseau_Geodesique_Francais_1993",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",49],PARAMETER["standard_parallel_2",44],PARAMETER["latitude_of_origin",46.5],PARAMETER["central_meridian",3],PARAMETER["false_easting",700000],PARAMETER["false_northing",6600000],UNIT["metre",1]]'
};
const DEFAULT_SRS_ROWS = [
  {
    srsName: 'Undefined Cartesian SRS',
    srsId: -1,
    organization: 'NONE',
    organizationCoordsysId: -1,
    definition: 'undefined',
    description: 'undefined Cartesian coordinate reference system'
  },
  {
    srsName: 'Undefined geographic SRS',
    srsId: 0,
    organization: 'NONE',
    organizationCoordsysId: 0,
    definition: 'undefined',
    description: 'undefined geographic coordinate reference system'
  },
  {
    srsName: 'WGS 84 geodetic',
    srsId: 4326,
    organization: 'EPSG',
    organizationCoordsysId: 4326,
    definition:
      'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
    description: 'longitude/latitude coordinates in decimal degrees on WGS 84'
  }
] as const;

let sqliteModulePromise: Promise<SqliteModule> | null = null;

async function getSqliteModule(): Promise<SqliteModule> {
  sqliteModulePromise ??= sqlite3InitModule();
  return sqliteModulePromise;
}

function quoteIdentifier(identifier: string): string {
  return `"${escapeIdentifier(identifier)}"`;
}

function normalizeLayerName(layerName: string): string {
  const normalized = layerName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, GEOPACKAGE_LAYER_NAME_MAX_LENGTH);
  return normalized || 'khartis_export';
}

function normalizeIdentifierKey(identifier: string): string {
  return identifier.toLowerCase();
}

function createUniqueIdentifier(
  preferredName: string,
  usedNames: Set<string>,
  options: {
    fallbackName: string;
    collisionSuffix?: string;
    maxLength?: number;
  }
): string {
  const maxLength = options.maxLength ?? Number.POSITIVE_INFINITY;
  const baseName = (preferredName.trim() || options.fallbackName).slice(
    0,
    maxLength
  );
  const buildCandidate = (suffix = '') =>
    `${baseName.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
  let candidate = buildCandidate();

  if (usedNames.has(normalizeIdentifierKey(candidate))) {
    const suffix = options.collisionSuffix ?? '_2';
    candidate = buildCandidate(suffix);
    let counter = 2;
    while (usedNames.has(normalizeIdentifierKey(candidate))) {
      candidate = buildCandidate(`${suffix}_${counter}`);
      counter += 1;
    }
  }

  usedNames.add(normalizeIdentifierKey(candidate));
  return candidate;
}

function createUniqueLayerName(
  layerName: string,
  usedLayerNames: Set<string>
): string {
  return createUniqueIdentifier(normalizeLayerName(layerName), usedLayerNames, {
    fallbackName: 'khartis_export',
    maxLength: GEOPACKAGE_LAYER_NAME_MAX_LENGTH
  });
}

function createPropertyColumnMappings(
  propertyColumns: string[]
): GeoPackagePropertyColumnMapping[] {
  const usedColumnNames = new Set(
    [...GEOPACKAGE_RESERVED_COLUMN_NAMES].map(normalizeIdentifierKey)
  );

  return propertyColumns.map((sourceName) => ({
    sourceName,
    columnName: createUniqueIdentifier(sourceName, usedColumnNames, {
      fallbackName: 'property',
      collisionSuffix: '_property'
    })
  }));
}

// First id of the user-defined range: EPSG codes stay below it.
const CUSTOM_SRS_ID = 100000;

function resolveSrs(
  sourceCrs: string | null,
  customSrs?: { name: string; definition: string }
): {
  srsName: string;
  srsId: number;
  organization: string;
  organizationCoordsysId: number;
  definition: string;
  description: string;
} {
  if (customSrs) {
    return {
      srsName: customSrs.name,
      srsId: CUSTOM_SRS_ID,
      organization: 'NONE',
      organizationCoordsysId: CUSTOM_SRS_ID,
      definition: customSrs.definition,
      description: customSrs.name
    };
  }

  const epsgCode = sourceCrs?.match(/^EPSG:(\d+)$/i)?.[1];
  if (epsgCode) {
    const srsId = Number(epsgCode);
    return {
      srsName: `EPSG:${srsId}`,
      srsId,
      organization: 'EPSG',
      organizationCoordsysId: srsId,
      definition:
        srsId === 4326
          ? DEFAULT_SRS_ROWS[2].definition
          : (EPSG_WKT_DEFINITIONS[srsId] ?? `EPSG:${srsId}`),
      description: `EPSG:${srsId}`
    };
  }

  return {
    srsName: DEFAULT_SRS_ROWS[0].srsName,
    srsId: DEFAULT_SRS_ROWS[0].srsId,
    organization: DEFAULT_SRS_ROWS[0].organization,
    organizationCoordsysId: DEFAULT_SRS_ROWS[0].organizationCoordsysId,
    definition: DEFAULT_SRS_ROWS[0].definition,
    description: DEFAULT_SRS_ROWS[0].description
  };
}

function readWkbGeometryType(wkb: Uint8Array): string {
  if (wkb.byteLength < 5) {
    return 'GEOMETRY';
  }

  const littleEndian = wkb[0] === 1;
  const dataView = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  const rawType = dataView.getUint32(1, littleEndian);
  const geometryType = rawType % 1000;

  switch (geometryType) {
    case 1:
      return 'POINT';
    case 2:
      return 'LINESTRING';
    case 3:
      return 'POLYGON';
    case 4:
      return 'MULTIPOINT';
    case 5:
      return 'MULTILINESTRING';
    case 6:
      return 'MULTIPOLYGON';
    case 7:
      return 'GEOMETRYCOLLECTION';
    default:
      return 'GEOMETRY';
  }
}

function createGeoPackageGeometryBlob(
  wkb: Uint8Array,
  srsId: number
): Uint8Array {
  const geometry = new Uint8Array(8 + wkb.byteLength);
  const dataView = new DataView(geometry.buffer);
  geometry[0] = 0x47;
  geometry[1] = 0x50;
  geometry[2] = 0;
  geometry[3] = 1;
  dataView.setInt32(4, srsId, true);
  geometry.set(wkb, 8);
  return geometry;
}

function normalizePropertyValue(value: unknown): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

function inferSqliteColumnType(values: unknown[]): string {
  const presentValues = values.filter(
    (value) => value !== null && value !== undefined
  );
  if (presentValues.length === 0) {
    return 'TEXT';
  }

  if (
    presentValues.every(
      (value) =>
        (typeof value === 'number' && Number.isInteger(value)) ||
        (typeof value === 'bigint' && Number.isSafeInteger(Number(value)))
    )
  ) {
    return 'INTEGER';
  }

  if (presentValues.every((value) => typeof value === 'number')) {
    return 'REAL';
  }

  return 'TEXT';
}

function resolveLayerGeometryType(features: GeoPackageFeatureRow[]): string {
  const geometryTypes = new Set(
    features.map((feature) => readWkbGeometryType(feature.wkb))
  );

  return geometryTypes.size === 1 ? [...geometryTypes][0] : 'GEOMETRY';
}

function createGeoPackageMetadata(db: SqliteDatabase): void {
  db.exec(`
    PRAGMA application_id = ${SQLITE_APPLICATION_ID_GEOPACKAGE};
    PRAGMA user_version = ${SQLITE_USER_VERSION_GEOPACKAGE_1_2};

    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT UNIQUE,
      description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      min_x DOUBLE,
      min_y DOUBLE,
      max_x DOUBLE,
      max_y DOUBLE,
      srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );

    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL,
      m TINYINT NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT uk_gc_table_name UNIQUE (table_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);
}

function insertSpatialReferenceSystems(
  db: SqliteDatabase,
  srsRows: Array<ReturnType<typeof resolveSrs>>
): void {
  const insertSrs = db.prepare(`
    INSERT OR IGNORE INTO gpkg_spatial_ref_sys (
      srs_name, srs_id, organization, organization_coordsys_id, definition, description
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  try {
    for (const row of [...DEFAULT_SRS_ROWS, ...srsRows]) {
      insertSrs
        .bind([
          row.srsName,
          row.srsId,
          row.organization,
          row.organizationCoordsysId,
          row.definition,
          row.description
        ])
        .stepReset();
    }
  } finally {
    insertSrs.finalize();
  }
}

function createGeoPackageFeatureTable(
  db: SqliteDatabase,
  options: {
    layerName: string;
    propertyColumnMappings: GeoPackagePropertyColumnMapping[];
    geometryType: string;
    srs: ReturnType<typeof resolveSrs>;
    features: GeoPackageFeatureRow[];
    columnTypes: Record<string, 'DATE' | 'DATETIME'>;
  }
): void {
  const { layerName, propertyColumnMappings, geometryType, srs, features } =
    options;
  db.prepare(
    `INSERT INTO gpkg_contents (table_name, data_type, identifier, description, srs_id)
     VALUES (?, 'features', ?, '', ?)`
  )
    .bind([layerName, layerName, srs.srsId])
    .stepFinalize();

  db.prepare(
    `INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
     VALUES (?, ?, ?, ?, 0, 0)`
  )
    .bind([layerName, GEOPACKAGE_GEOMETRY_COLUMN, geometryType, srs.srsId])
    .stepFinalize();

  const propertyDefinitions = propertyColumnMappings.map((mapping) => {
    const values = features.map(
      (feature) => feature.properties[mapping.sourceName]
    );
    const declared = Object.hasOwn(options.columnTypes, mapping.sourceName)
      ? options.columnTypes[mapping.sourceName]
      : undefined;
    return `${quoteIdentifier(mapping.columnName)} ${declared ?? inferSqliteColumnType(values)}`;
  });
  const columnDefinitions = [
    `${quoteIdentifier(GEOPACKAGE_ID_COLUMN)} INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL`,
    ...propertyDefinitions,
    `${quoteIdentifier(GEOPACKAGE_GEOMETRY_COLUMN)} BLOB NOT NULL`
  ];

  db.exec(
    `CREATE TABLE ${quoteIdentifier(layerName)} (${columnDefinitions.join(', ')})`
  );
}

function insertFeatures(
  db: SqliteDatabase,
  options: {
    layerName: string;
    propertyColumnMappings: GeoPackagePropertyColumnMapping[];
    srsId: number;
    features: GeoPackageFeatureRow[];
  }
): void {
  const { layerName, propertyColumnMappings, srsId, features } = options;
  const insertColumns = [
    ...propertyColumnMappings.map((mapping) =>
      quoteIdentifier(mapping.columnName)
    ),
    quoteIdentifier(GEOPACKAGE_GEOMETRY_COLUMN)
  ];
  const placeholders = insertColumns.map(() => '?').join(', ');
  const statement = db.prepare(
    `INSERT INTO ${quoteIdentifier(layerName)} (${insertColumns.join(', ')})
     VALUES (${placeholders})`
  );

  try {
    for (const feature of features) {
      const values = [
        ...propertyColumnMappings.map((mapping) =>
          normalizePropertyValue(feature.properties[mapping.sourceName])
        ),
        createGeoPackageGeometryBlob(feature.wkb, srsId)
      ];
      statement.bind(values).stepReset();
    }
  } finally {
    statement.finalize();
  }
}

// GDAL and QGIS read and write this table under this exact shape.
function createLayerStylesTable(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE layer_styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      f_table_catalog TEXT(256),
      f_table_schema TEXT(256),
      f_table_name TEXT(256),
      f_geometry_column TEXT(256),
      styleName TEXT(30),
      styleQML TEXT,
      styleSLD TEXT,
      useAsDefault BOOLEAN,
      description TEXT,
      owner TEXT(30),
      ui TEXT(30),
      update_time DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO gpkg_contents (table_name, data_type, identifier, description)
    VALUES ('layer_styles', 'attributes', 'layer_styles', '');
  `);
}

function insertLayerStyle(
  db: SqliteDatabase,
  layerName: string,
  style: GeoPackageLayerStyle
): void {
  db.prepare(
    `INSERT INTO layer_styles (
       f_table_catalog, f_table_schema, f_table_name, f_geometry_column,
       styleName, styleQML, styleSLD, useAsDefault, description, owner, ui
     ) VALUES ('', '', ?, ?, ?, ?, '', 1, ?, '', NULL)`
  )
    .bind([
      layerName,
      GEOPACKAGE_GEOMETRY_COLUMN,
      style.name,
      style.qml,
      style.description ?? ''
    ])
    .stepFinalize();
}

type Extent = [number, number, number, number];

// Walks a WKB geometry (2D, XY) and widens `extent` with its coordinates.
function extendExtentWithWkb(wkb: Uint8Array, extent: Extent): void {
  const view = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  let offset = 0;
  const readGeometry = (): void => {
    const littleEndian = view.getUint8(offset) === 1;
    const rawType = view.getUint32(offset + 1, littleEndian);
    offset += 5;
    const type = rawType % 1000;
    const dimensions = rawType >= 3000 ? 4 : rawType >= 1000 ? 3 : 2;
    const readPoint = () => {
      const x = view.getFloat64(offset, littleEndian);
      const y = view.getFloat64(offset + 8, littleEndian);
      offset += 8 * dimensions;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        extent[0] = Math.min(extent[0], x);
        extent[1] = Math.min(extent[1], y);
        extent[2] = Math.max(extent[2], x);
        extent[3] = Math.max(extent[3], y);
      }
    };
    const readCount = () => {
      const count = view.getUint32(offset, littleEndian);
      offset += 4;
      return count;
    };
    const readPoints = () => {
      for (let count = readCount(); count > 0; count -= 1) readPoint();
    };
    switch (type) {
      case 1:
        readPoint();
        break;
      case 2:
        readPoints();
        break;
      case 3:
        for (let rings = readCount(); rings > 0; rings -= 1) readPoints();
        break;
      case 4:
      case 5:
      case 6:
      case 7:
        for (let parts = readCount(); parts > 0; parts -= 1) readGeometry();
        break;
      default:
        throw new RangeError(`Unsupported WKB geometry type ${rawType}`);
    }
  };
  readGeometry();
}

/** [xmin, ymin, xmax, ymax] of WKB features, null when none is readable. */
export function computeLayerExtent(
  features: GeoPackageFeatureRow[]
): Extent | null {
  const extent: Extent = [Infinity, Infinity, -Infinity, -Infinity];
  try {
    for (const feature of features) {
      extendExtentWithWkb(feature.wkb, extent);
    }
  } catch {
    return null;
  }
  return extent[0] <= extent[2] ? extent : null;
}

// QGIS zooms to a layer from these columns before it scans the features.
function updateLayerExtent(
  db: SqliteDatabase,
  layerName: string,
  features: GeoPackageFeatureRow[]
): void {
  const extent = computeLayerExtent(features);
  if (!extent) {
    return;
  }
  db.prepare(
    `UPDATE gpkg_contents SET min_x = ?, min_y = ?, max_x = ?, max_y = ? WHERE table_name = ?`
  )
    .bind([...extent, layerName])
    .stepFinalize();
}

export async function exportGeoPackageLayers(
  layers: GeoPackageLayerExportOptions[]
): Promise<Blob> {
  const exportableLayers = layers.filter((layer) => layer.features.length > 0);
  if (exportableLayers.length === 0) {
    throw new DataValidationError(
      m.error_geopackage_no_features_to_export(),
      'features',
      {
        layerCount: layers.length
      }
    );
  }

  const sqlite3 = await getSqliteModule();
  const db = new sqlite3.oo1.DB(':memory:', 'cw');
  const usedLayerNames = new Set<string>();
  const preparedLayers = exportableLayers.map((layer) => {
    const layerName = createUniqueLayerName(layer.layerName, usedLayerNames);
    const propertyColumns = Array.from(
      new Set([
        ...(layer.propertyColumns ?? []),
        ...layer.features.flatMap((feature) => Object.keys(feature.properties))
      ])
    );
    return {
      layerName,
      propertyColumnMappings: createPropertyColumnMappings(propertyColumns),
      srs: resolveSrs(layer.sourceCrs, layer.customSrs),
      geometryType: resolveLayerGeometryType(layer.features),
      features: layer.features,
      style: layer.style,
      columnTypes: layer.columnTypes ?? {}
    };
  });

  try {
    createGeoPackageMetadata(db);
    insertSpatialReferenceSystems(
      db,
      preparedLayers.map((layer) => layer.srs)
    );

    for (const layer of preparedLayers) {
      createGeoPackageFeatureTable(db, layer);
      insertFeatures(db, {
        layerName: layer.layerName,
        propertyColumnMappings: layer.propertyColumnMappings,
        srsId: layer.srs.srsId,
        features: layer.features
      });
      updateLayerExtent(db, layer.layerName, layer.features);
    }

    const styledLayers = preparedLayers.filter((layer) => layer.style);
    if (styledLayers.length > 0) {
      createLayerStylesTable(db);
      for (const layer of styledLayers) {
        if (layer.style) {
          insertLayerStyle(db, layer.layerName, layer.style);
        }
      }
    }

    const dbPointer = db.pointer;
    if (dbPointer === undefined) {
      throw new PipelineError(
        m.error_geopackage_database_closed(),
        GEOPACKAGE_EXPORT_DB_CLOSED_ERROR_CODE,
        { layerCount: preparedLayers.length }
      );
    }

    const exported = sqlite3.capi.sqlite3_js_db_export(dbPointer);
    const bytes = new Uint8Array(exported.byteLength);
    bytes.set(exported);
    return new Blob([bytes.buffer], { type: MIME.GEOPACKAGE });
  } finally {
    db.close();
  }
}
