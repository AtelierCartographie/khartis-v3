import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import proj4 from 'proj4';
import { reprojectPoint } from '$lib/features/duckdb/io/reprojection';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { parseWkbToGeoJson } from '$lib/features/map/io/geometry-parser';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

type SqliteModule = Awaited<ReturnType<typeof sqlite3InitModule>>;

interface GeoPackageLayerRow {
  layer_name: string;
  geometry_column: string;
  geometry_type: string | null;
  srs_id: number | bigint | string | null;
  organization: string | null;
  organization_coordsys_id: number | bigint | string | null;
  definition: string | null;
}

interface GeoPackageLayerCandidate {
  layerName: string;
  geometryColumn: string;
  geometryType: string | null;
  featureCount: number;
  sourceCrs: string | null;
  definition: string | null;
}

interface GeoPackageBrowserFallbackOptions {
  preferredLayer?: string;
}

type SqliteRow = Record<string, unknown>;
type GeoPackageLayerRecord = SqliteRow & GeoPackageLayerRow;

let sqliteModulePromise: Promise<SqliteModule> | null = null;

function getGeometryPriority(geometryType: string | null): number {
  const normalized = geometryType?.toLowerCase() ?? '';

  if (normalized.includes('polygon')) return 0;
  if (normalized.includes('line')) return 1;
  if (normalized.includes('point')) return 2;

  return 3;
}

function quoteIdentifier(identifier: string): string {
  return `"${escapeIdentifier(identifier)}"`;
}

function normalizeSqliteBlob(value: unknown): Uint8Array | null {
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

function normalizePropertyValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = normalizeSqliteBlob(value);
    return bytes ? Array.from(bytes) : null;
  }

  return value;
}

function resolveSourceCrs(
  organization: string | null,
  organizationCoordsysId: number | bigint | string | null,
  srsId: number | bigint | string | null
): string | null {
  const normalizedOrganization = organization?.toUpperCase() ?? null;
  const numericOrganizationCoordsysId =
    organizationCoordsysId === null || organizationCoordsysId === undefined
      ? null
      : Number(organizationCoordsysId);
  const numericSrsId =
    srsId === null || srsId === undefined ? null : Number(srsId);

  if (
    normalizedOrganization === 'NONE' ||
    numericOrganizationCoordsysId === -1 ||
    numericSrsId === -1
  ) {
    return null;
  }

  if (
    normalizedOrganization &&
    numericOrganizationCoordsysId !== null &&
    Number.isFinite(numericOrganizationCoordsysId)
  ) {
    return `${normalizedOrganization}:${numericOrganizationCoordsysId}`;
  }

  if (numericSrsId !== null && Number.isFinite(numericSrsId)) {
    return `EPSG:${numericSrsId}`;
  }

  return null;
}

function ensureProjectionDefinition(
  sourceCrs: string | null,
  definition: string | null
): void {
  if (!sourceCrs || !definition) {
    return;
  }

  const normalized = sourceCrs.toUpperCase();
  if (proj4.defs(normalized) !== undefined) {
    return;
  }

  try {
    proj4.defs(normalized, definition);
  } catch (error) {
    logger.error('Failed to register proj4 definition', LogCategory.MAP, error);
  }
}

function reprojectGeometryCoordinates(
  coords: unknown,
  sourceCrs: string
): void {
  if (!Array.isArray(coords)) {
    return;
  }

  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    const result = reprojectPoint(
      coords[0] as number,
      coords[1] as number,
      sourceCrs
    );

    if (result.success && result.coordinates) {
      coords[0] = result.coordinates[0];
      coords[1] = result.coordinates[1];
    }
    return;
  }

  for (const child of coords) {
    reprojectGeometryCoordinates(child, sourceCrs);
  }
}

function reprojectGeometryInPlace(geometry: Geometry, sourceCrs: string): void {
  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) {
      reprojectGeometryInPlace(child, sourceCrs);
    }
    return;
  }

  reprojectGeometryCoordinates(geometry.coordinates, sourceCrs);
}

export function extractWkbFromGeoPackageGeometry(
  geometryBlob: Uint8Array
): Uint8Array | null {
  if (geometryBlob.length < 8) {
    return null;
  }

  if (geometryBlob[0] !== 0x47 || geometryBlob[1] !== 0x50) {
    return geometryBlob;
  }

  const flags = geometryBlob[3] ?? 0;
  const isEmpty = (flags & 0b0001_0000) !== 0;
  if (isEmpty) {
    return null;
  }

  const envelopeIndicator = (flags >> 1) & 0b0000_0111;
  const envelopeBytes =
    envelopeIndicator === 0
      ? 0
      : envelopeIndicator === 1
        ? 32
        : envelopeIndicator === 2 || envelopeIndicator === 3
          ? 48
          : envelopeIndicator === 4
            ? 64
            : 0;

  const headerBytes = 8 + envelopeBytes;
  if (geometryBlob.length <= headerBytes) {
    return null;
  }

  return geometryBlob.subarray(headerBytes);
}

async function getSqliteModule(): Promise<SqliteModule> {
  sqliteModulePromise ??= sqlite3InitModule();
  return sqliteModulePromise;
}

async function selectPreferredLayer(
  db: InstanceType<SqliteModule['oo1']['DB']>,
  preferredLayer?: string
): Promise<GeoPackageLayerCandidate> {
  const layerRows = db.selectObjects(`
    SELECT
      gc.table_name AS layer_name,
      gc.column_name AS geometry_column,
      gc.geometry_type_name AS geometry_type,
      gc.srs_id AS srs_id,
      srs.organization AS organization,
      srs.organization_coordsys_id AS organization_coordsys_id,
      srs.definition AS definition
    FROM gpkg_geometry_columns AS gc
    JOIN gpkg_contents AS contents
      ON contents.table_name = gc.table_name
    LEFT JOIN gpkg_spatial_ref_sys AS srs
      ON srs.srs_id = gc.srs_id
    WHERE contents.data_type = 'features'
  `) as unknown as GeoPackageLayerRecord[];

  const candidates = layerRows.map((row) => {
    const layerName = row.layer_name;
    const featureCount = Number(
      db.selectValue(`SELECT COUNT(*) FROM ${quoteIdentifier(layerName)}`) ?? 0
    );

    return {
      layerName,
      geometryColumn: row.geometry_column,
      geometryType: row.geometry_type,
      featureCount,
      sourceCrs: resolveSourceCrs(
        row.organization,
        row.organization_coordsys_id,
        row.srs_id
      ),
      definition: row.definition
    } satisfies GeoPackageLayerCandidate;
  });

  if (preferredLayer) {
    const requestedLayer = candidates.find(
      (candidate) => candidate.layerName === preferredLayer
    );
    if (requestedLayer) {
      return requestedLayer;
    }
  }

  const selectedLayer = [...candidates].sort((left, right) => {
    const priorityDiff =
      getGeometryPriority(left.geometryType) -
      getGeometryPriority(right.geometryType);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    if (left.featureCount !== right.featureCount) {
      return right.featureCount - left.featureCount;
    }

    return left.layerName.localeCompare(right.layerName);
  })[0];

  if (!selectedLayer) {
    throw new Error('No feature layer found in GeoPackage');
  }

  return selectedLayer;
}

export async function convertGeoPackageToGeoJsonFile(
  file: File,
  options: GeoPackageBrowserFallbackOptions = {}
): Promise<File> {
  const sqlite3 = await getSqliteModule();
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const tempPath = `/tmp/${crypto.randomUUID()}-${file.name}`;

  sqlite3.capi.sqlite3_js_posix_create_file(tempPath, fileBytes);

  const db = new sqlite3.oo1.DB(tempPath, 'r');

  try {
    const selectedLayer = await selectPreferredLayer(
      db,
      options.preferredLayer
    );

    ensureProjectionDefinition(
      selectedLayer.sourceCrs,
      selectedLayer.definition ?? null
    );

    const rows = db.selectObjects(
      `SELECT * FROM ${quoteIdentifier(selectedLayer.layerName)}`
    ) as SqliteRow[];

    const features: Feature[] = [];
    for (const row of rows) {
      const geometryValue = normalizeSqliteBlob(
        row[selectedLayer.geometryColumn]
      );
      if (!geometryValue) {
        continue;
      }

      const wkb = extractWkbFromGeoPackageGeometry(geometryValue);
      if (!wkb) {
        continue;
      }

      const geometry = parseWkbToGeoJson(wkb, {
        validateCoordinates: false
      });
      if (!geometry) {
        continue;
      }

      if (
        selectedLayer.sourceCrs &&
        selectedLayer.sourceCrs.toUpperCase() !== 'EPSG:4326'
      ) {
        reprojectGeometryInPlace(geometry, selectedLayer.sourceCrs);
      }

      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === selectedLayer.geometryColumn) {
          continue;
        }
        properties[key] = normalizePropertyValue(value);
      }

      features.push({
        type: 'Feature',
        geometry,
        properties
      });
    }

    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features
    };

    return new File(
      [JSON.stringify(featureCollection)],
      file.name.replace(/\.gpkg$/i, '.geojson'),
      { type: 'application/geo+json' }
    );
  } finally {
    db.close();
  }
}
