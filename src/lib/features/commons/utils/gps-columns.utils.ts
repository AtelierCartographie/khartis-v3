import { GEO_COLUMN_TYPE } from '../constants/data.constants';
import type { GeoDetectionResult } from './geo-detection.utils';

const GPS_COLUMN_PATTERNS = {
  latitude: /^(lat|latitude|y_coord|y|lat_dd|latitude_dd|geo_lat)$/i,
  longitude: /^(lon|long|longitude|x_coord|x|lon_dd|longitude_dd|lng|geo_lon)$/i
} as const;

const LATITUDE_TOKENS = ['lat', 'latitude', 'geolat'] as const;
const LONGITUDE_TOKENS = ['lon', 'long', 'longitude', 'lng', 'geolon'] as const;

export function isLikelyCoordinateColumn(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    LATITUDE_TOKENS.includes(normalized as (typeof LATITUDE_TOKENS)[number]) ||
    LONGITUDE_TOKENS.includes(normalized as (typeof LONGITUDE_TOKENS)[number])
  );
}

type GPSResolvableColumn = {
  name: string;
  geo_type?: unknown;
  geo_confidence?: unknown;
  semioType?: unknown;
  semioScore?: unknown;
};

type ResolvedGPSColumns = {
  lat: string;
  lon: string;
};

function getColumnMatchScore(
  column: Pick<GPSResolvableColumn, 'geo_confidence' | 'semioScore'>
): number {
  const geoConfidence =
    typeof column.geo_confidence === 'number' ? column.geo_confidence : 0;
  const semioScore =
    typeof column.semioScore === 'number' ? column.semioScore : 0;

  return Math.max(geoConfidence, semioScore);
}

function normalizeGeoText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenizeColumnName(name: string): string[] {
  const normalized = normalizeGeoText(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();

  return normalized.length > 0 ? normalized.split(/\s+/) : [];
}

function matchesLatitudeTokens(tokens: string[]): boolean {
  return tokens.some((token) =>
    (LATITUDE_TOKENS as readonly string[]).includes(token)
  );
}

function matchesLongitudeTokens(tokens: string[]): boolean {
  return tokens.some((token) =>
    (LONGITUDE_TOKENS as readonly string[]).includes(token)
  );
}

function resolveByDetectionMetadata(
  columns: GPSResolvableColumn[],
  geoDetection?: Pick<GeoDetectionResult, 'geoColumns'> | null
): ResolvedGPSColumns | null {
  if (!geoDetection?.geoColumns?.length) {
    return null;
  }

  const availableColumnNames = new Set(columns.map((column) => column.name));
  const pickColumnName = (
    type: typeof GEO_COLUMN_TYPE.LATITUDE | typeof GEO_COLUMN_TYPE.LONGITUDE
  ): string | undefined =>
    geoDetection.geoColumns
      .filter(
        (column) =>
          column.type === type &&
          (availableColumnNames.size === 0 ||
            availableColumnNames.has(column.columnName))
      )
      .sort((left, right) => right.confidence - left.confidence)[0]?.columnName;

  const lat = pickColumnName(GEO_COLUMN_TYPE.LATITUDE);
  const lon = pickColumnName(GEO_COLUMN_TYPE.LONGITUDE);

  if (!lat || !lon || lat === lon) {
    return null;
  }

  return { lat, lon };
}

function resolveByColumnMetadata(
  columns: GPSResolvableColumn[]
): ResolvedGPSColumns | null {
  const pickColumnName = (
    matcher: (column: GPSResolvableColumn) => boolean
  ): string | undefined =>
    [...columns]
      .filter(matcher)
      .sort(
        (left, right) => getColumnMatchScore(right) - getColumnMatchScore(left)
      )[0]?.name;

  const lat =
    pickColumnName(
      (column) =>
        column.geo_type === GEO_COLUMN_TYPE.LATITUDE ||
        column.semioType === 'geolat'
    ) ??
    columns.find((column) => GPS_COLUMN_PATTERNS.latitude.test(column.name))
      ?.name ??
    columns.find((column) =>
      matchesLatitudeTokens(tokenizeColumnName(column.name))
    )?.name;

  const lon =
    pickColumnName(
      (column) =>
        column.geo_type === GEO_COLUMN_TYPE.LONGITUDE ||
        column.semioType === 'geolon'
    ) ??
    columns.find((column) => GPS_COLUMN_PATTERNS.longitude.test(column.name))
      ?.name ??
    columns.find((column) =>
      matchesLongitudeTokens(tokenizeColumnName(column.name))
    )?.name;

  if (!lat || !lon || lat === lon) {
    return null;
  }

  return { lat, lon };
}

export function resolveGPSCoordinateColumns(
  columns: GPSResolvableColumn[],
  geoDetection?: Pick<GeoDetectionResult, 'geoColumns'> | null
): ResolvedGPSColumns | null {
  return (
    resolveByDetectionMetadata(columns, geoDetection) ??
    resolveByColumnMetadata(columns)
  );
}

export function hasGPSCoordinateColumns(
  columns: GPSResolvableColumn[],
  geoDetection?: Pick<GeoDetectionResult, 'geoColumns'> | null
): boolean {
  return resolveGPSCoordinateColumns(columns, geoDetection) !== null;
}
