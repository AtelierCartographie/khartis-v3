import type sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { MIME } from '../constants';
import { escapeIdentifier } from './sanitize.utils';

type SqliteModule = Awaited<ReturnType<typeof sqlite3InitModule>>;

export interface GeoPackageFeatureRow {
  properties: Record<string, unknown>;
  wkb: Uint8Array;
}

export interface GeoPackageExportOptions {
  layerName: string;
  sourceCrs: string | null;
}

const GEOPACKAGE_GEOMETRY_COLUMN = 'geom';
const GEOPACKAGE_ID_COLUMN = 'fid';
const SQLITE_APPLICATION_ID_GEOPACKAGE = 1196444487;
const SQLITE_USER_VERSION_GEOPACKAGE_1_2 = 10200;
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
  if (!sqliteModulePromise) {
    sqliteModulePromise = import('@sqlite.org/sqlite-wasm').then(
      ({ default: initSqlite }) => initSqlite()
    );
  }

  return sqliteModulePromise;
}

function quoteIdentifier(identifier: string): string {
  return `"${escapeIdentifier(identifier)}"`;
}

function normalizeLayerName(layerName: string): string {
  const normalized = layerName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48);
  return normalized || 'khartis_export';
}

function resolveSrs(sourceCrs: string | null): {
  srsName: string;
  srsId: number;
  organization: string;
  organizationCoordsysId: number;
  definition: string;
  description: string;
} {
  const epsgCode = sourceCrs?.match(/^EPSG:(\d+)$/i)?.[1];
  if (epsgCode) {
    const srsId = Number(epsgCode);
    return {
      srsName: `EPSG:${srsId}`,
      srsId,
      organization: 'EPSG',
      organizationCoordsysId: srsId,
      definition:
        srsId === 4326 ? DEFAULT_SRS_ROWS[2].definition : `EPSG:${srsId}`,
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
      (value) => typeof value === 'number' && Number.isInteger(value)
    )
  ) {
    return 'INTEGER';
  }

  if (presentValues.every((value) => typeof value === 'number')) {
    return 'REAL';
  }

  return 'TEXT';
}

function createGeoPackageSchema(
  db: InstanceType<SqliteModule['oo1']['DB']>,
  options: {
    layerName: string;
    propertyColumns: string[];
    geometryType: string;
    srs: ReturnType<typeof resolveSrs>;
    features: GeoPackageFeatureRow[];
  }
): void {
  const { layerName, propertyColumns, geometryType, srs, features } = options;
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

  const insertSrs = db.prepare(`
    INSERT OR IGNORE INTO gpkg_spatial_ref_sys (
      srs_name, srs_id, organization, organization_coordsys_id, definition, description
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  try {
    for (const row of [...DEFAULT_SRS_ROWS, srs]) {
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

  const propertyDefinitions = propertyColumns.map((columnName) => {
    const values = features.map((feature) => feature.properties[columnName]);
    return `${quoteIdentifier(columnName)} ${inferSqliteColumnType(values)}`;
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
  db: InstanceType<SqliteModule['oo1']['DB']>,
  options: {
    layerName: string;
    propertyColumns: string[];
    srsId: number;
    features: GeoPackageFeatureRow[];
  }
): void {
  const { layerName, propertyColumns, srsId, features } = options;
  const insertColumns = [
    ...propertyColumns.map(quoteIdentifier),
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
        ...propertyColumns.map((column) =>
          normalizePropertyValue(feature.properties[column])
        ),
        createGeoPackageGeometryBlob(feature.wkb, srsId)
      ];
      statement.bind(values).stepReset();
    }
  } finally {
    statement.finalize();
  }
}

export async function exportGeoPackage(
  features: GeoPackageFeatureRow[],
  options: GeoPackageExportOptions
): Promise<Blob> {
  if (features.length === 0) {
    throw new Error('No feature rows to export');
  }

  const sqlite3 = await getSqliteModule();
  const db = new sqlite3.oo1.DB(':memory:', 'cw');
  const layerName = normalizeLayerName(options.layerName);
  const propertyColumns = Array.from(
    new Set(features.flatMap((feature) => Object.keys(feature.properties)))
  );
  const srs = resolveSrs(options.sourceCrs);
  const geometryType = readWkbGeometryType(features[0].wkb);

  try {
    createGeoPackageSchema(db, {
      layerName,
      propertyColumns,
      geometryType,
      srs,
      features
    });
    insertFeatures(db, {
      layerName,
      propertyColumns,
      srsId: srs.srsId,
      features
    });

    const dbPointer = db.pointer;
    if (dbPointer === undefined) {
      throw new Error('SQLite database is closed');
    }

    const exported = sqlite3.capi.sqlite3_js_db_export(dbPointer);
    const bytes = new Uint8Array(exported.byteLength);
    bytes.set(exported);
    return new Blob([bytes.buffer], { type: MIME.GEOPACKAGE });
  } finally {
    db.close();
  }
}
