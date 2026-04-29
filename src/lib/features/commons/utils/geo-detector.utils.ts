import * as m from '$lib/paraglide/messages';
import {
  GEO_COLUMN_TYPE,
  type GeoColumnTypeValue
} from '../constants/data.constants';
import { GEO_DETECTION } from '../constants/detection.constants';

export interface GeoColumnResult {
  index: number;
  columnName: string;
  type: GeoColumnTypeValue;
  confidence: number;
  sampleValues?: string[];
  matchedPatterns?: string[];
}

export interface GeoDetectionResult {
  hasGeoColumns: boolean;
  geoColumns: GeoColumnResult[];
  suggestedPrimaryGeoColumn?: GeoColumnResult;
  warnings: string[];
}

const COLUMN_NAME_PATTERNS = {
  latitude: /^(lat|latitude|y_coord|y|lat_dd|latitude_dd|geo_lat)$/i,
  longitude:
    /^(lon|long|longitude|x_coord|x|lon_dd|longitude_dd|lng|geo_lon)$/i,
  country: /^(country[\s_]?(name|code)?|pays|nation|state|etat|entity|area)$/i,
  iso2: /^(iso[\s_]?2|iso[\s_]?alpha[\s_]?2|country[\s_]?iso[\s_]?2|code[\s_]?iso[\s_]?2|alpha[\s_]?2)$/i,
  iso3: /^(iso[\s_]?3|iso[\s_]?alpha[\s_]?3|country[\s_]?iso[\s_]?3|code[\s_]?iso[\s_]?3|alpha[\s_]?3|country[\s_]?code)$/i,
  nuts: /^(nuts[\s_]?(code|id|2|3)?|code[\s_]?nuts|nuts[\s_]?level[\s_]?\d?)$/i,
  region:
    /^(region|province|department|departement|county|oblast|prefecture)$/i,
  city: /^(city|ville|town|commune|municipality|ciudad|stadt)$/i,
  coordinates: /^(coord|coords|coordinates|point|location|geometry|wkt)$/i,
  name: /^(name|nom|designation|libelle|label|title)$/i,
  code: /^(code|id|identifier|identifiant|key|geocode)$/i
} as const;

const VALUE_PATTERNS = {
  latitude: (value: string) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= -90 && num <= 90;
  },
  longitude: (value: string) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= -180 && num <= 180;
  },
  iso2: (value: string) => /^[A-Z]{2}$/.test(value.trim().toUpperCase()),
  iso3: (value: string) => /^[A-Z]{3}$/.test(value.trim().toUpperCase()),
  nuts: (value: string) => {
    const v = value.trim().toUpperCase();
    return /^[A-Z]{2}[A-Z0-9]{1,3}$/.test(v);
  },
  coordinates: (value: string) => {
    return (
      /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(value) ||
      /^POINT\s*\(/.test(value.toUpperCase()) ||
      /^\[?\s*-?\d+\.?\d*\s*,\s*-?\d+\.?\d*\s*\]?$/.test(value)
    );
  }
} as const;

const COUNTRY_SAMPLES = [
  'FRANCE',
  'GERMANY',
  'SPAIN',
  'ITALY',
  'UNITED KINGDOM',
  'POLAND',
  'ALLEMAGNE',
  'ESPAGNE',
  'ITALIE',
  'ROYAUME-UNI',
  'POLOGNE',
  'DEUTSCHLAND',
  'SPANIEN',
  'ITALIEN',
  'POLEN',
  'ALGERIA',
  'ANGOLA',
  'ARGENTINA',
  'AUSTRALIA',
  'AUSTRIA',
  'BELGIUM',
  'BRAZIL',
  'CANADA',
  'CHILE',
  'CHINA',
  'COLOMBIA',
  'DENMARK',
  'EGYPT',
  'FINLAND',
  'INDIA',
  'INDONESIA',
  'JAPAN',
  'MEXICO',
  'MOROCCO',
  'NETHERLANDS',
  'NIGERIA',
  'NORWAY',
  'PORTUGAL',
  'RUSSIA',
  'SOUTH AFRICA',
  'SWEDEN',
  'SWITZERLAND',
  'TURKEY',
  'UKRAINE',
  'USA',
  'VIETNAM'
] as const;

const REGION_SAMPLES = [
  'ILE-DE-FRANCE',
  'GUADELOUPE',
  'MARTINIQUE',
  'GUYANE',
  'LA REUNION',
  'MAYOTTE',
  'CENTRE-VAL DE LOIRE',
  'BOURGOGNE-FRANCHE-COMTE',
  'NORMANDIE',
  'HAUTS-DE-FRANCE',
  'GRAND EST',
  'PAYS DE LA LOIRE',
  'NOUVELLE-AQUITAINE',
  'OCCITANIE',
  'AUVERGNE-RHONE-ALPES',
  "PROVENCE-ALPES-COTE D'AZUR",
  'CORSE',
  'BAVARIA',
  'CATALONIA',
  'LOMBARDY',
  'MAZOWIECKIE',
  'BRETAGNE',
  'BAYERN',
  'ANDALUSIA',
  'LAZIO',
  'WIELKOPOLSKIE'
] as const;

const CITY_SAMPLES = [
  'PARIS',
  'BERLIN',
  'MADRID',
  'ROME',
  'WARSAW',
  'LONDON',
  'LYON',
  'MUNICH',
  'BARCELONA',
  'MILAN',
  'KRAKOW',
  'MANCHESTER'
] as const;

const NUTS_SAMPLES = [
  'FR10',
  'FR21',
  'FR22',
  'FR23',
  'FR24',
  'FR25',
  'DE11',
  'DE12',
  'DE13',
  'DE21',
  'DE30',
  'DEA1',
  'ES11',
  'ES12',
  'ES13',
  'ES21',
  'ES30',
  'ES51',
  'ITF1',
  'ITF2',
  'ITF3',
  'ITC1',
  'ITC4',
  'ITH3',
  'PL21',
  'PL22',
  'PL41',
  'PL51',
  'PL61',
  'PL71',
  'NL11',
  'NL12',
  'NL13',
  'NL21',
  'NL22',
  'NL31'
] as const;

const HEADER_KEYWORDS = {
  country: {
    strong: ['country', 'pays', 'nation'],
    weak: ['entity']
  },
  region: [
    'region',
    'rgion',
    'province',
    'department',
    'departement',
    'dpartement',
    'county',
    'oblast',
    'prefecture'
  ],
  city: ['city', 'ville', 'town', 'commune', 'municipality', 'ciudad', 'stadt'],
  coordinates: [
    'coord',
    'coords',
    'coordinates',
    'point',
    'location',
    'geometry',
    'wkt'
  ],
  iso2: ['iso2', 'isoalpha2', 'countryiso2', 'codeiso2', 'alpha2'],
  iso3: [
    'iso3',
    'isoalpha3',
    'countryiso3',
    'codeiso3',
    'alpha3',
    'countrycode'
  ],
  nuts: ['nuts', 'nutscode', 'nutsid', 'nuts2', 'nuts3', 'nutslevel']
} as const;

function hasSufficientDistinctCodeValues(values: string[]): boolean {
  const uniqueCount = new Set(values.map((v) => v.toUpperCase())).size;
  const requiredDistinctCount = Math.min(
    10,
    Math.max(3, Math.ceil(values.length * 0.05))
  );
  return uniqueCount >= requiredDistinctCount;
}

export const GPS_COLUMN_PATTERNS = {
  latitude: COLUMN_NAME_PATTERNS.latitude,
  longitude: COLUMN_NAME_PATTERNS.longitude
} as const;

export const LATITUDE_TOKENS = ['lat', 'latitude', 'geolat'] as const;
export const LONGITUDE_TOKENS = [
  'lon',
  'long',
  'longitude',
  'lng',
  'geolon'
] as const;

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

function collapseGeoText(value: string): string {
  return normalizeGeoText(value).replace(/[^a-z0-9]+/g, '');
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

function expandHeaderTokens(tokens: string[]): string[] {
  const expanded = new Set(tokens);

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];

    if (left.length === 1 && right.length >= 3) {
      expanded.add(`${left}${right}`);
    }
  }

  return [...expanded];
}

function hasHeaderKeyword(
  tokens: string[],
  collapsedHeader: string,
  keywords: readonly string[]
): boolean {
  return keywords.some(
    (keyword) =>
      tokens.includes(keyword) ||
      (keyword.length >= 4 && collapsedHeader.includes(keyword))
  );
}

function getStringValues(values: unknown[]): string[] {
  return values
    .filter((value) => value != null)
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

function getNumericLikeShare(values: string[]): number {
  if (values.length === 0) {
    return 0;
  }

  const numericLikeValues = values.filter((value) =>
    /^-?\d+(?:[.,]\d+)?$/.test(value)
  );

  return numericLikeValues.length / values.length;
}

function getSemanticSampleMatch(
  type: GeoColumnResult['type'],
  values: string[]
): number {
  switch (type) {
    case GEO_COLUMN_TYPE.COUNTRY_NAME:
      return GeoColumnDetector.matchAgainstSamples(values, COUNTRY_SAMPLES);
    case GEO_COLUMN_TYPE.REGION:
      return GeoColumnDetector.matchAgainstSamples(values, REGION_SAMPLES);
    case GEO_COLUMN_TYPE.CITY:
      return GeoColumnDetector.matchAgainstSamples(values, CITY_SAMPLES);
    default:
      return 0;
  }
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

export interface GPSRangeValidation {
  column: GeoColumnResult;
  totalChecked: number;
  outOfRange: number;
  looksSwapped: boolean;
}

const LAT_RANGE: readonly [number, number] = [-90, 90];
const LON_RANGE: readonly [number, number] = [-180, 180];

function validateGPSColumnRange(
  column: GeoColumnResult,
  values: unknown[],
  expectedRange: readonly [number, number],
  swapRange: readonly [number, number]
): GPSRangeValidation {
  const numericValues = values
    .map((raw) => parseFloat(String(raw)))
    .filter((n) => Number.isFinite(n));
  const outOfRange = numericValues.filter(
    (n) => n < expectedRange[0] || n > expectedRange[1]
  );
  const looksSwapped =
    numericValues.length > 0 &&
    outOfRange.length / numericValues.length >= 0.5 &&
    numericValues.every((n) => n >= swapRange[0] && n <= swapRange[1]);
  return {
    column,
    totalChecked: numericValues.length,
    outOfRange: outOfRange.length,
    looksSwapped
  };
}

function numericStats(values: unknown[]): {
  count: number;
  maxAbs: number;
  minAbs: number;
  mean: number;
} {
  const numbers = values
    .map((v) => parseFloat(String(v)))
    .filter((n) => Number.isFinite(n));
  if (numbers.length === 0) {
    return { count: 0, maxAbs: 0, minAbs: 0, mean: 0 };
  }
  const abs = numbers.map((n) => Math.abs(n));
  return {
    count: numbers.length,
    maxAbs: Math.max(...abs),
    minAbs: Math.min(...abs),
    mean: numbers.reduce((a, b) => a + b, 0) / numbers.length
  };
}

function detectMagnitudeSwap(
  latValues: unknown[],
  lonValues: unknown[]
): boolean {
  const latStats = numericStats(latValues);
  const lonStats = numericStats(lonValues);
  if (latStats.count < 2 || lonStats.count < 2) return false;
  // Both axes are in their declared legal ranges but their magnitudes look
  // reversed for European-style bounded datasets: latitude cluster small,
  // longitude cluster large. This flags the CSV-11 Seveso IDF swap.
  const latLooksLikeEuropeanLongitude =
    latStats.maxAbs < 15 && latStats.minAbs < 15;
  const lonLooksLikeEuropeanLatitude =
    lonStats.minAbs > 40 && lonStats.maxAbs < 90;
  return latLooksLikeEuropeanLongitude && lonLooksLikeEuropeanLatitude;
}

export function collectGPSRangeWarnings(
  latColumn: GeoColumnResult | undefined,
  lonColumn: GeoColumnResult | undefined,
  context: {
    headers: string[];
    data: unknown[][];
    sampleSize?: number;
  }
): string[] {
  const warnings: string[] = [];
  const { headers, data, sampleSize } = context;
  const effectiveSample = sampleSize ?? Math.min(100, data.length);

  function valuesFor(columnIndex: number): unknown[] {
    return data
      .slice(0, effectiveSample)
      .map((row) => row[columnIndex])
      .filter((v) => v != null && v !== '');
  }

  const latValidation = latColumn
    ? validateGPSColumnRange(
        latColumn,
        valuesFor(latColumn.index),
        LAT_RANGE,
        LON_RANGE
      )
    : null;
  const lonValidation = lonColumn
    ? validateGPSColumnRange(
        lonColumn,
        valuesFor(lonColumn.index),
        LON_RANGE,
        LAT_RANGE
      )
    : null;

  const bothLookSwapped =
    !!latValidation &&
    !!lonValidation &&
    latValidation.looksSwapped &&
    lonValidation.looksSwapped;

  const magnitudeSwap =
    !!latColumn &&
    !!lonColumn &&
    !bothLookSwapped &&
    detectMagnitudeSwap(valuesFor(latColumn.index), valuesFor(lonColumn.index));

  if (bothLookSwapped || magnitudeSwap) {
    warnings.push(
      m.gps_warning_columns_swapped({
        latColumn: latColumn!.columnName,
        lonColumn: lonColumn!.columnName
      })
    );
  } else {
    if (
      latValidation &&
      latValidation.outOfRange > 0 &&
      !latValidation.looksSwapped
    ) {
      warnings.push(
        m.gps_warning_lat_values_out_of_range({
          columnName: latColumn!.columnName,
          outOfRange: String(latValidation.outOfRange),
          totalChecked: String(latValidation.totalChecked)
        })
      );
    }
    if (
      lonValidation &&
      lonValidation.outOfRange > 0 &&
      !lonValidation.looksSwapped
    ) {
      warnings.push(
        m.gps_warning_lon_values_out_of_range({
          columnName: lonColumn!.columnName,
          outOfRange: String(lonValidation.outOfRange),
          totalChecked: String(lonValidation.totalChecked)
        })
      );
    }
    if (latValidation && latValidation.looksSwapped && !bothLookSwapped) {
      warnings.push(
        m.gps_warning_lat_looks_lon({ columnName: latColumn!.columnName })
      );
    }
    if (lonValidation && lonValidation.looksSwapped && !bothLookSwapped) {
      warnings.push(
        m.gps_warning_lon_looks_lat({ columnName: lonColumn!.columnName })
      );
    }
  }

  // Silence unused headers warning until callers need per-column headings
  void headers;
  return warnings;
}

interface FallbackGPSContext {
  headers: string[];
  data: unknown[][];
  sampleSize?: number;
  alreadyCoveredLatIndex?: number;
  alreadyCoveredLonIndex?: number;
}

function collectFallbackGPSWarnings(context: FallbackGPSContext): string[] {
  const warnings: string[] = [];
  const {
    headers,
    data,
    sampleSize,
    alreadyCoveredLatIndex,
    alreadyCoveredLonIndex
  } = context;
  const effectiveSample = sampleSize ?? Math.min(100, data.length);

  const latIndex = headers.findIndex(
    (h, i) =>
      i !== alreadyCoveredLatIndex && COLUMN_NAME_PATTERNS.latitude.test(h)
  );
  const lonIndex = headers.findIndex(
    (h, i) =>
      i !== alreadyCoveredLonIndex && COLUMN_NAME_PATTERNS.longitude.test(h)
  );

  function valuesFor(columnIndex: number): number[] {
    return data
      .slice(0, effectiveSample)
      .map((row) => parseFloat(String(row[columnIndex])))
      .filter((n) => Number.isFinite(n));
  }

  if (latIndex >= 0 && latIndex !== alreadyCoveredLatIndex) {
    const values = valuesFor(latIndex);
    if (values.length > 0) {
      const outOfRange = values.filter(
        (n) => n < LAT_RANGE[0] || n > LAT_RANGE[1]
      ).length;
      if (outOfRange > 0) {
        warnings.push(
          m.gps_warning_lat_values_out_of_range({
            columnName: headers[latIndex],
            outOfRange: String(outOfRange),
            totalChecked: String(values.length)
          })
        );
      }
    }
  }

  if (lonIndex >= 0 && lonIndex !== alreadyCoveredLonIndex) {
    const values = valuesFor(lonIndex);
    if (values.length > 0) {
      const outOfRange = values.filter(
        (n) => n < LON_RANGE[0] || n > LON_RANGE[1]
      ).length;
      if (outOfRange > 0) {
        warnings.push(
          m.gps_warning_lon_values_out_of_range({
            columnName: headers[lonIndex],
            outOfRange: String(outOfRange),
            totalChecked: String(values.length)
          })
        );
      }
    }
  }

  return warnings;
}

export const GeoColumnDetector = {
  async detectGeoColumns(
    headers: string[],
    data: unknown[][],
    options: { sampleSize?: number } = {}
  ): Promise<GeoDetectionResult> {
    const sampleSize = options.sampleSize || Math.min(100, data.length);
    const results: GeoColumnResult[] = [];
    const warnings: string[] = [];

    // Process columns in chunks to avoid blocking
    const COLUMN_CHUNK_SIZE = 10;
    for (let i = 0; i < headers.length; i += COLUMN_CHUNK_SIZE) {
      // Yield to event loop between chunks
      await new Promise((resolve) => setTimeout(resolve, 0));

      const endIndex = Math.min(i + COLUMN_CHUNK_SIZE, headers.length);
      for (let colIndex = i; colIndex < endIndex; colIndex++) {
        const header = headers[colIndex];
        const columnValues = data
          .slice(0, sampleSize)
          .map((row) => row[colIndex])
          .filter((val) => val != null && val !== '');

        if (columnValues.length === 0) {
          continue;
        }

        const detection = GeoColumnDetector.detectColumnType(
          header,
          columnValues
        );
        if (detection && detection.confidence > GEO_DETECTION.MIN_CONFIDENCE) {
          results.push({
            ...detection,
            index: colIndex,
            columnName: header
          });
        }
      }
    }

    const latColumn = results.find((r) => r.type === GEO_COLUMN_TYPE.LATITUDE);
    const lonColumn = results.find((r) => r.type === GEO_COLUMN_TYPE.LONGITUDE);
    if (latColumn && !lonColumn) {
      warnings.push(m.geo_detector_latitude_only());
    } else if (!latColumn && lonColumn) {
      warnings.push(m.geo_detector_longitude_only());
    }

    const rangeWarnings = collectGPSRangeWarnings(latColumn, lonColumn, {
      headers,
      data,
      sampleSize
    });
    warnings.push(...rangeWarnings);

    // Fallback: even if the detector rejected a lat/lon column because of out-of-range
    // values, look at header names and emit range warnings so the user is told what's wrong.
    if (!latColumn || !lonColumn) {
      const fallbackWarnings = collectFallbackGPSWarnings({
        headers,
        data,
        sampleSize,
        alreadyCoveredLatIndex: latColumn?.index,
        alreadyCoveredLonIndex: lonColumn?.index
      });
      warnings.push(...fallbackWarnings);
    }

    const hasGeoColumns = results.length > 0;
    const suggestedPrimaryGeoColumn =
      GeoColumnDetector.selectPrimaryGeoColumn(results);

    return {
      hasGeoColumns,
      geoColumns: results,
      suggestedPrimaryGeoColumn,
      warnings
    };
  },

  detectColumnType(
    header: string,
    values: unknown[]
  ): Omit<GeoColumnResult, 'index' | 'columnName'> | null {
    const sampleValues = values.slice(0, 5).map((v) => String(v));
    const headerDetection = GeoColumnDetector.detectByHeader(header, values);

    const valueBasedType = GeoColumnDetector.detectByValues(values);
    if (headerDetection && valueBasedType) {
      if (headerDetection.type === valueBasedType.type) {
        return {
          ...valueBasedType,
          confidence: Math.max(
            headerDetection.confidence,
            valueBasedType.confidence
          ),
          sampleValues,
          matchedPatterns: [
            ...(headerDetection.matchedPatterns ?? []),
            ...(valueBasedType.matchedPatterns ?? [])
          ]
        };
      }

      if (valueBasedType.confidence > headerDetection.confidence + 0.15) {
        return {
          ...valueBasedType,
          sampleValues
        };
      }

      return {
        ...headerDetection,
        sampleValues
      };
    }

    if (headerDetection) {
      return {
        ...headerDetection,
        sampleValues
      };
    }

    if (valueBasedType) {
      return {
        ...valueBasedType,
        sampleValues
      };
    }

    return null;
  },

  detectByHeader(
    header: string,
    values: unknown[]
  ): Omit<GeoColumnResult, 'index' | 'columnName'> | null {
    const tokens = expandHeaderTokens(tokenizeColumnName(header));
    const collapsedHeader = collapseGeoText(header);
    const stringValues = getStringValues(values);
    const numericLikeShare = getNumericLikeShare(stringValues);

    const headerMatchers: Array<{
      type: GeoColumnResult['type'];
      matches: boolean;
      confidence: number;
      reason: string;
    }> = [
      {
        type: GEO_COLUMN_TYPE.LATITUDE,
        matches: matchesLatitudeTokens(tokens),
        confidence: GEO_DETECTION.EXCEPTIONAL,
        reason: 'Header tokens: latitude'
      },
      {
        type: GEO_COLUMN_TYPE.LONGITUDE,
        matches: matchesLongitudeTokens(tokens),
        confidence: GEO_DETECTION.EXCEPTIONAL,
        reason: 'Header tokens: longitude'
      },
      {
        type: GEO_COLUMN_TYPE.ISO2,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.iso2
        ),
        confidence: GEO_DETECTION.EXCEPTIONAL,
        reason: 'Header keywords: ISO2'
      },
      {
        type: GEO_COLUMN_TYPE.ISO3,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.iso3
        ),
        confidence: GEO_DETECTION.EXCEPTIONAL,
        reason: 'Header keywords: ISO3'
      },
      {
        type: GEO_COLUMN_TYPE.NUTS,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.nuts
        ),
        confidence: GEO_DETECTION.NEAR_CERTAIN,
        reason: 'Header keywords: NUTS'
      },
      {
        type: GEO_COLUMN_TYPE.COUNTRY_NAME,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.country.strong
        ),
        confidence: 0.75,
        reason: 'Header keywords: country'
      },
      {
        type: GEO_COLUMN_TYPE.COUNTRY_NAME,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.country.weak
        ),
        confidence: 0.6,
        reason: 'Header keywords: entity'
      },
      {
        type: GEO_COLUMN_TYPE.REGION,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.region
        ),
        confidence: 0.75,
        reason: 'Header keywords: region'
      },
      {
        type: GEO_COLUMN_TYPE.CITY,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.city
        ),
        confidence: 0.72,
        reason: 'Header keywords: city'
      },
      {
        type: GEO_COLUMN_TYPE.COORDINATES,
        matches: hasHeaderKeyword(
          tokens,
          collapsedHeader,
          HEADER_KEYWORDS.coordinates
        ),
        confidence: 0.7,
        reason: 'Header keywords: coordinates'
      }
    ];

    for (const matcher of headerMatchers) {
      if (!matcher.matches) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(VALUE_PATTERNS, matcher.type)) {
        const valueConfidence = GeoColumnDetector.validateColumnValues(
          matcher.type,
          values
        );
        if (valueConfidence > GEO_DETECTION.MIN_CONFIDENCE) {
          return {
            type: matcher.type,
            confidence: Math.max(matcher.confidence, valueConfidence),
            matchedPatterns: [matcher.reason]
          };
        }
        continue;
      }

      if (
        (matcher.type === GEO_COLUMN_TYPE.COUNTRY_NAME ||
          matcher.type === GEO_COLUMN_TYPE.CITY) &&
        numericLikeShare > 0.8
      ) {
        continue;
      }

      if (
        matcher.type === GEO_COLUMN_TYPE.REGION &&
        numericLikeShare > 0.8 &&
        !collapsedHeader.includes('code')
      ) {
        continue;
      }

      const semanticMatch = getSemanticSampleMatch(matcher.type, stringValues);
      const confidence = Math.max(
        matcher.confidence,
        Math.min(
          semanticMatch * GEO_DETECTION.MULTIPLIER_STRONG,
          GEO_DETECTION.VERY_HIGH_CONFIDENCE
        )
      );

      if (confidence > GEO_DETECTION.MIN_CONFIDENCE) {
        return {
          type: matcher.type,
          confidence,
          matchedPatterns: [matcher.reason]
        };
      }
    }

    for (const [type, pattern] of Object.entries(COLUMN_NAME_PATTERNS)) {
      if (pattern.test(header)) {
        const confidence = GeoColumnDetector.validateColumnValues(type, values);
        if (confidence > GEO_DETECTION.MIN_CONFIDENCE) {
          return {
            type: type as GeoColumnResult['type'],
            confidence,
            matchedPatterns: [pattern.source]
          };
        }
      }
    }

    return null;
  },

  detectByValues(
    values: unknown[]
  ): Omit<GeoColumnResult, 'index' | 'columnName'> | null {
    const stringValues = getStringValues(values);

    if (stringValues.length === 0) return null;

    const iso2Match =
      stringValues.filter((v) => VALUE_PATTERNS.iso2(v)).length /
      stringValues.length;
    if (
      iso2Match > GEO_DETECTION.MATCH_THRESHOLD &&
      hasSufficientDistinctCodeValues(stringValues)
    ) {
      return {
        type: GEO_COLUMN_TYPE.ISO2,
        confidence: iso2Match,
        matchedPatterns: ['Value pattern: ISO2']
      };
    }

    const iso3Match =
      stringValues.filter((v) => VALUE_PATTERNS.iso3(v)).length /
      stringValues.length;
    if (
      iso3Match > GEO_DETECTION.MATCH_THRESHOLD &&
      hasSufficientDistinctCodeValues(stringValues)
    ) {
      return {
        type: GEO_COLUMN_TYPE.ISO3,
        confidence: iso3Match,
        matchedPatterns: ['Value pattern: ISO3']
      };
    }

    const nutsMatch =
      stringValues.filter((v) => VALUE_PATTERNS.nuts(v)).length /
      stringValues.length;
    if (nutsMatch > GEO_DETECTION.MATCH_THRESHOLD) {
      return {
        type: GEO_COLUMN_TYPE.NUTS,
        confidence: nutsMatch,
        matchedPatterns: ['Value pattern: NUTS code']
      };
    }

    const nutsSampleMatch = GeoColumnDetector.matchAgainstSamples(
      stringValues,
      NUTS_SAMPLES
    );
    if (nutsSampleMatch > GEO_DETECTION.LOW_MATCH_THRESHOLD) {
      return {
        type: GEO_COLUMN_TYPE.NUTS,
        confidence: Math.min(
          nutsSampleMatch * GEO_DETECTION.MULTIPLIER_STRONG,
          GEO_DETECTION.NEAR_CERTAIN
        ),
        matchedPatterns: ['Value pattern: Known NUTS codes']
      };
    }

    const countryMatch = GeoColumnDetector.matchAgainstSamples(
      stringValues,
      COUNTRY_SAMPLES
    );
    if (countryMatch > GEO_DETECTION.MEDIUM_MATCH_THRESHOLD) {
      return {
        type: GEO_COLUMN_TYPE.COUNTRY_NAME,
        confidence: Math.min(
          countryMatch * GEO_DETECTION.MULTIPLIER_STRONG,
          GEO_DETECTION.EXCEPTIONAL
        ),
        matchedPatterns: ['Value pattern: Known country names']
      };
    }

    const regionMatch = GeoColumnDetector.matchAgainstSamples(
      stringValues,
      REGION_SAMPLES
    );
    if (regionMatch > GEO_DETECTION.MEDIUM_MATCH_THRESHOLD) {
      return {
        type: GEO_COLUMN_TYPE.REGION,
        confidence: Math.min(
          regionMatch * GEO_DETECTION.MULTIPLIER_STRONG,
          GEO_DETECTION.VERY_HIGH_CONFIDENCE
        ),
        matchedPatterns: ['Value pattern: Known region names']
      };
    }

    const cityMatch = GeoColumnDetector.matchAgainstSamples(
      stringValues,
      CITY_SAMPLES
    );
    if (cityMatch > GEO_DETECTION.MEDIUM_MATCH_THRESHOLD) {
      return {
        type: GEO_COLUMN_TYPE.CITY,
        confidence: Math.min(
          cityMatch * GEO_DETECTION.MULTIPLIER_STRONG,
          GEO_DETECTION.VERY_HIGH_CONFIDENCE
        ),
        matchedPatterns: ['Value pattern: Known city names']
      };
    }

    return null;
  },

  validateColumnValues(type: string, values: unknown[]): number {
    const validator = VALUE_PATTERNS[type as keyof typeof VALUE_PATTERNS];
    if (!validator) return 0;

    const validValues = values
      .filter((v) => v != null && v !== '')
      .map((v) => String(v).trim());

    if (validValues.length === 0) return 0;

    const validCount = validValues.filter((v) => validator(v)).length;
    return validCount / validValues.length;
  },

  matchAgainstSamples(values: string[], samples: readonly string[]): number {
    const normalizedValues = values.map((value) =>
      normalizeGeoText(value)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    );
    const normalizedSamples = samples.map((sample) =>
      normalizeGeoText(sample)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    );

    const matchCount = normalizedValues.filter((value) =>
      normalizedSamples.some((sample) => {
        if (sample === value) {
          return true;
        }

        if (sample.length < 4 || value.length < 4) {
          return false;
        }

        return value.includes(sample) || sample.includes(value);
      })
    ).length;

    return matchCount / values.length;
  },

  selectPrimaryGeoColumn(
    columns: GeoColumnResult[]
  ): GeoColumnResult | undefined {
    if (columns.length === 0) return undefined;

    const priorityOrder: GeoColumnTypeValue[] = [
      GEO_COLUMN_TYPE.ISO3,
      GEO_COLUMN_TYPE.ISO2,
      GEO_COLUMN_TYPE.NUTS,
      GEO_COLUMN_TYPE.COUNTRY_NAME,
      GEO_COLUMN_TYPE.REGION,
      GEO_COLUMN_TYPE.CITY,
      GEO_COLUMN_TYPE.COORDINATES,
      GEO_COLUMN_TYPE.LATITUDE
    ];

    for (const type of priorityOrder) {
      const column = columns
        .filter((c) => c.type === type)
        .sort((a, b) => b.confidence - a.confidence)[0];

      if (column) return column;
    }

    return columns.sort((a, b) => b.confidence - a.confidence)[0];
  },

  getGeoColumnDescription(column: GeoColumnResult): string {
    const descriptions: Record<GeoColumnResult['type'], string> = {
      latitude: m.geo_detector_latitude(),
      longitude: m.geo_detector_longitude(),
      country_name: m.geo_detector_country_name(),
      iso2: m.geo_detector_iso2(),
      iso3: m.geo_detector_iso3(),
      nuts: m.geo_detector_nuts(),
      region: m.geo_detector_region(),
      city: m.geo_detector_city(),
      coordinates: m.geo_detector_coordinates(),
      unknown: m.geo_detector_unknown()
    };

    return descriptions[column.type] || m.geo_detector_default();
  }
} as const;
