export interface GeoColumnResult {
  index: number;
  columnName: string;
  type:
    | 'latitude'
    | 'longitude'
    | 'country_name'
    | 'iso2'
    | 'iso3'
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

export class GeoColumnDetector {
  private static readonly COLUMN_NAME_PATTERNS = {
    latitude: /^(lat|latitude|y_coord|y|lat_dd|latitude_dd|geo_lat)$/i,
    longitude:
      /^(lon|long|longitude|x_coord|x|lon_dd|longitude_dd|lng|geo_lon)$/i,
    country: /^(country[\s_]?(name|code)?|pays|nation|state|etat)$/i,
    iso2: /^(iso[\s_]?2|iso[\s_]?alpha[\s_]?2|country[\s_]?iso[\s_]?2|code[\s_]?iso[\s_]?2|alpha[\s_]?2)$/i,
    iso3: /^(iso[\s_]?3|iso[\s_]?alpha[\s_]?3|country[\s_]?iso[\s_]?3|code[\s_]?iso[\s_]?3|alpha[\s_]?3|country[\s_]?code)$/i,
    region:
      /^(region|province|department|departement|county|oblast|prefecture)$/i,
    city: /^(city|ville|town|commune|municipality|ciudad|stadt)$/i,
    coordinates: /^(coord|coords|coordinates|point|location|geometry|wkt)$/i,
    name: /^(name|nom|designation|libelle|label|title)$/i,
    code: /^(code|id|identifier|identifiant|key|geocode)$/i
  };

  private static readonly VALUE_PATTERNS = {
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
    coordinates: (value: string) => {
      return (
        /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(value) ||
        /^POINT\s*\(/.test(value.toUpperCase()) ||
        /^\[?\s*-?\d+\.?\d*\s*,\s*-?\d+\.?\d*\s*\]?$/.test(value)
      );
    }
  };

  private static readonly COUNTRY_SAMPLES = [
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
    'POLEN'
  ];

  private static readonly REGION_SAMPLES = [
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
  ];

  private static readonly CITY_SAMPLES = [
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
  ];

  static async detectGeoColumns(
    headers: string[],
    data: any[][],
    options: { sampleSize?: number } = {}
  ): Promise<GeoDetectionResult> {
    const sampleSize = options.sampleSize || Math.min(100, data.length);
    const results: GeoColumnResult[] = [];
    const warnings: string[] = [];

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      const columnValues = data
        .slice(0, sampleSize)
        .map((row) => row[colIndex])
        .filter((val) => val != null && val !== '');

      if (columnValues.length === 0) {
        continue;
      }

      const detection = this.detectColumnType(header, columnValues);
      if (detection && detection.confidence > 0.5) {
        results.push({
          ...detection,
          index: colIndex,
          columnName: header
        });
      }
    }

    const latColumn = results.find((r) => r.type === 'latitude');
    const lonColumn = results.find((r) => r.type === 'longitude');
    if (latColumn && !lonColumn) {
      warnings.push('Colonne latitude détectée sans longitude correspondante');
    } else if (!latColumn && lonColumn) {
      warnings.push('Colonne longitude détectée sans latitude correspondante');
    }

    const hasGeoColumns = results.length > 0;
    const suggestedPrimaryGeoColumn = this.selectPrimaryGeoColumn(results);

    return {
      hasGeoColumns,
      geoColumns: results,
      suggestedPrimaryGeoColumn,
      warnings
    };
  }

  private static detectColumnType(
    header: string,
    values: any[]
  ): Omit<GeoColumnResult, 'index' | 'columnName'> | null {
    const headerLower = header.toLowerCase().trim();
    const sampleValues = values.slice(0, 5).map((v) => String(v));

    for (const [type, pattern] of Object.entries(this.COLUMN_NAME_PATTERNS)) {
      if (pattern.test(header)) {
        const confidence = this.validateColumnValues(type, values);
        if (confidence > 0.5) {
          return {
            type: type as GeoColumnResult['type'],
            confidence,
            sampleValues,
            matchedPatterns: [pattern.source]
          };
        }
      }
    }

    const valueBasedType = this.detectByValues(values);
    if (valueBasedType) {
      return {
        ...valueBasedType,
        sampleValues
      };
    }

    if (headerLower.includes('lat')) {
      const latConfidence = this.validateColumnValues('latitude', values);
      if (latConfidence > 0.5) {
        return {
          type: 'latitude',
          confidence: latConfidence * 0.8,
          sampleValues
        };
      }
    }

    if (headerLower.includes('lon') || headerLower.includes('lng')) {
      const lonConfidence = this.validateColumnValues('longitude', values);
      if (lonConfidence > 0.5) {
        return {
          type: 'longitude',
          confidence: lonConfidence * 0.8,
          sampleValues
        };
      }
    }

    return null;
  }

  private static detectByValues(
    values: any[]
  ): Omit<GeoColumnResult, 'index' | 'columnName'> | null {
    const stringValues = values
      .filter((v) => v != null)
      .map((v) => String(v).trim());

    if (stringValues.length === 0) return null;

    const iso2Match =
      stringValues.filter((v) => this.VALUE_PATTERNS.iso2(v)).length /
      stringValues.length;
    if (iso2Match > 0.8) {
      return {
        type: 'iso2',
        confidence: iso2Match,
        matchedPatterns: ['Value pattern: ISO2']
      };
    }

    const iso3Match =
      stringValues.filter((v) => this.VALUE_PATTERNS.iso3(v)).length /
      stringValues.length;
    if (iso3Match > 0.8) {
      return {
        type: 'iso3',
        confidence: iso3Match,
        matchedPatterns: ['Value pattern: ISO3']
      };
    }

    const latMatch =
      stringValues.filter((v) => this.VALUE_PATTERNS.latitude(v)).length /
      stringValues.length;
    if (latMatch > 0.8) {
      return {
        type: 'latitude',
        confidence: latMatch,
        matchedPatterns: ['Value pattern: Latitude range']
      };
    }

    const lonMatch =
      stringValues.filter((v) => this.VALUE_PATTERNS.longitude(v)).length /
      stringValues.length;
    if (lonMatch > 0.8) {
      return {
        type: 'longitude',
        confidence: lonMatch,
        matchedPatterns: ['Value pattern: Longitude range']
      };
    }

    const countryMatch = this.matchAgainstSamples(
      stringValues,
      this.COUNTRY_SAMPLES
    );
    if (countryMatch > 0.3) {
      return {
        type: 'country_name',
        confidence: Math.min(countryMatch * 1.5, 0.95),
        matchedPatterns: ['Value pattern: Known country names']
      };
    }

    const regionMatch = this.matchAgainstSamples(
      stringValues,
      this.REGION_SAMPLES
    );
    if (regionMatch > 0.3) {
      return {
        type: 'region',
        confidence: Math.min(regionMatch * 1.5, 0.85),
        matchedPatterns: ['Value pattern: Known region names']
      };
    }

    const cityMatch = this.matchAgainstSamples(stringValues, this.CITY_SAMPLES);
    if (cityMatch > 0.3) {
      return {
        type: 'city',
        confidence: Math.min(cityMatch * 1.5, 0.85),
        matchedPatterns: ['Value pattern: Known city names']
      };
    }

    return null;
  }

  private static validateColumnValues(type: string, values: any[]): number {
    const validator =
      this.VALUE_PATTERNS[type as keyof typeof this.VALUE_PATTERNS];
    if (!validator) return 0;

    const validValues = values
      .filter((v) => v != null && v !== '')
      .map((v) => String(v).trim());

    if (validValues.length === 0) return 0;

    const validCount = validValues.filter((v) => validator(v)).length;
    return validCount / validValues.length;
  }

  private static matchAgainstSamples(
    values: string[],
    samples: string[]
  ): number {
    const upperValues = values.map((v) => v.toUpperCase());
    const matchCount = upperValues.filter((v) =>
      samples.some((s) => s === v || v.includes(s) || s.includes(v))
    ).length;

    return matchCount / values.length;
  }

  private static selectPrimaryGeoColumn(
    columns: GeoColumnResult[]
  ): GeoColumnResult | undefined {
    if (columns.length === 0) return undefined;

    const priorityOrder: GeoColumnResult['type'][] = [
      'country_name',
      'iso3',
      'iso2',
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
  }

  static getGeoColumnDescription(column: GeoColumnResult): string {
    const descriptions: Record<GeoColumnResult['type'], string> = {
      latitude: 'Coordonnées de latitude',
      longitude: 'Coordonnées de longitude',
      country_name: 'Noms de pays',
      iso2: 'Codes pays ISO Alpha-2',
      iso3: 'Codes pays ISO Alpha-3',
      region: 'Régions ou provinces',
      city: 'Villes ou communes',
      coordinates: 'Coordonnées géographiques',
      unknown: 'Type géographique non déterminé'
    };

    return descriptions[column.type] || 'Colonne géographique';
  }
}
