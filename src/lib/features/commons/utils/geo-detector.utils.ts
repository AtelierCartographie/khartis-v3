import * as m from '$lib/paraglide/messages';
import { GEO_DETECTION } from '../constants/detection.constants';

export interface GeoColumnResult {
  index: number;
  columnName: string;
  type:
    | 'latitude'
    | 'longitude'
    | 'country_name'
    | 'iso2'
    | 'iso3'
    | 'nuts'
    | 'region'
    | 'city'
    | 'coordinates'
    | 'unknown';
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

export function hasGPSCoordinateColumns(
  columns: Array<{ name: string }>
): boolean {
  const hasLat = columns.some((col) =>
    GPS_COLUMN_PATTERNS.latitude.test(col.name)
  );
  const hasLon = columns.some((col) =>
    GPS_COLUMN_PATTERNS.longitude.test(col.name)
  );
  return hasLat && hasLon;
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

    const latColumn = results.find((r) => r.type === 'latitude');
    const lonColumn = results.find((r) => r.type === 'longitude');
    if (latColumn && !lonColumn) {
      warnings.push('Latitude column detected without corresponding longitude');
    } else if (!latColumn && lonColumn) {
      warnings.push('Longitude column detected without corresponding latitude');
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
    const headerLower = header.toLowerCase().trim();
    const sampleValues = values.slice(0, 5).map((v) => String(v));

    for (const [type, pattern] of Object.entries(COLUMN_NAME_PATTERNS)) {
      if (pattern.test(header)) {
        const confidence = GeoColumnDetector.validateColumnValues(type, values);
        if (confidence > GEO_DETECTION.MIN_CONFIDENCE) {
          return {
            type: type as GeoColumnResult['type'],
            confidence,
            sampleValues,
            matchedPatterns: [pattern.source]
          };
        }
      }
    }

    const valueBasedType = GeoColumnDetector.detectByValues(values);
    if (valueBasedType) {
      return {
        ...valueBasedType,
        sampleValues
      };
    }

    if (headerLower.includes('lat')) {
      const latConfidence = GeoColumnDetector.validateColumnValues(
        'latitude',
        values
      );
      if (latConfidence > GEO_DETECTION.MIN_CONFIDENCE) {
        return {
          type: 'latitude',
          confidence: latConfidence * GEO_DETECTION.MULTIPLIER_MODERATE,
          sampleValues
        };
      }
    }

    if (headerLower.includes('lon') || headerLower.includes('lng')) {
      const lonConfidence = GeoColumnDetector.validateColumnValues(
        'longitude',
        values
      );
      if (lonConfidence > GEO_DETECTION.MIN_CONFIDENCE) {
        return {
          type: 'longitude',
          confidence: lonConfidence * GEO_DETECTION.MULTIPLIER_MODERATE,
          sampleValues
        };
      }
    }

    return null;
  },

  detectByValues(
    values: unknown[]
  ): Omit<GeoColumnResult, 'index' | 'columnName'> | null {
    const stringValues = values
      .filter((v) => v != null)
      .map((v) => String(v).trim());

    if (stringValues.length === 0) return null;

    const iso2Match =
      stringValues.filter((v) => VALUE_PATTERNS.iso2(v)).length /
      stringValues.length;
    if (
      iso2Match > GEO_DETECTION.MATCH_THRESHOLD &&
      hasSufficientDistinctCodeValues(stringValues)
    ) {
      return {
        type: 'iso2',
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
        type: 'iso3',
        confidence: iso3Match,
        matchedPatterns: ['Value pattern: ISO3']
      };
    }

    const nutsMatch =
      stringValues.filter((v) => VALUE_PATTERNS.nuts(v)).length /
      stringValues.length;
    if (nutsMatch > GEO_DETECTION.MATCH_THRESHOLD) {
      return {
        type: 'nuts',
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
        type: 'nuts',
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
        type: 'country_name',
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
        type: 'region',
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
        type: 'city',
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
    const upperValues = values.map((v) => v.toUpperCase());
    const matchCount = upperValues.filter((v) =>
      samples.some((s) => s === v || v.includes(s) || s.includes(v))
    ).length;

    return matchCount / values.length;
  },

  selectPrimaryGeoColumn(
    columns: GeoColumnResult[]
  ): GeoColumnResult | undefined {
    if (columns.length === 0) return undefined;

    const priorityOrder: GeoColumnResult['type'][] = [
      'country_name',
      'iso3',
      'iso2',
      'nuts',
      'region',
      'city',
      'coordinates',
      'latitude'
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
