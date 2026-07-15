import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/paraglide/messages', () => ({
  geo_detector_latitude: () => 'Latitude',
  geo_detector_longitude: () => 'Longitude',
  geo_detector_country_name: () => 'Country name',
  geo_detector_iso2: () => 'ISO2',
  geo_detector_iso3: () => 'ISO3',
  geo_detector_nuts: () => 'NUTS',
  geo_detector_region: () => 'Region',
  geo_detector_city: () => 'City',
  geo_detector_coordinates: () => 'Coordinates',
  geo_detector_unknown: () => 'Unknown',
  geo_detector_default: () => 'Geo column'
}));

import {
  GeoColumnDetector,
  isLikelyCoordinateColumn,
  resolveGPSCoordinateColumns
} from '$lib/features/commons/utils/geo-detector.utils';

describe('isLikelyCoordinateColumn', () => {
  it.each(['lat', 'latitude', 'geolat'])('returns true for "%s"', (name) => {
    expect(isLikelyCoordinateColumn(name)).toBe(true);
  });

  it.each(['lon', 'lng', 'longitude', 'geolon'])(
    'returns true for "%s"',
    (name) => {
      expect(isLikelyCoordinateColumn(name)).toBe(true);
    }
  );

  it('returns false for non-coordinate column names', () => {
    expect(isLikelyCoordinateColumn('population')).toBe(false);
    expect(isLikelyCoordinateColumn('country')).toBe(false);
  });

  it('is case-insensitive via trim+lower', () => {
    expect(isLikelyCoordinateColumn(' Lat ')).toBe(true);
  });
});

describe('GeoColumnDetector.validateColumnValues', () => {
  it('returns high confidence for valid latitude values', () => {
    const values = ['48.85', '-33.86', '51.5', '40.71', '35.68'];
    expect(
      GeoColumnDetector.validateColumnValues('latitude', values)
    ).toBeGreaterThan(0.9);
  });

  it('returns 0 for out-of-range latitude values', () => {
    const values = ['200', '300', '150'];
    expect(GeoColumnDetector.validateColumnValues('latitude', values)).toBe(0);
  });

  it('validates ISO2 pattern (2 uppercase letters)', () => {
    const values = ['FR', 'DE', 'US', 'GB', 'IT'];
    expect(GeoColumnDetector.validateColumnValues('iso2', values)).toBe(1);
  });

  it('validates ISO3 pattern (3 uppercase letters)', () => {
    const values = ['FRA', 'DEU', 'USA', 'GBR', 'ITA'];
    expect(GeoColumnDetector.validateColumnValues('iso3', values)).toBe(1);
  });

  it('validates NUTS codes', () => {
    const values = ['FR10', 'DE11', 'ES51', 'ITF1'];
    expect(GeoColumnDetector.validateColumnValues('nuts', values)).toBe(1);
  });
});

describe('GeoColumnDetector.detectByValues', () => {
  it('detects ISO2 from all-uppercase 2-letter values', () => {
    const values = ['FR', 'DE', 'US', 'GB', 'IT', 'ES', 'PL', 'NL', 'BE', 'PT'];
    const result = GeoColumnDetector.detectByValues(values);
    expect(result?.type).toBe('iso2');
  });

  it('detects ISO3 from 3-letter values', () => {
    const values = [
      'FRA',
      'DEU',
      'USA',
      'GBR',
      'ITA',
      'ESP',
      'POL',
      'NLD',
      'BEL',
      'PRT'
    ];
    const result = GeoColumnDetector.detectByValues(values);
    expect(result?.type).toBe('iso3');
  });

  it('returns null for generic numeric values', () => {
    const values = ['1', '2', '3', '4', '5'];
    expect(GeoColumnDetector.detectByValues(values)).toBeNull();
  });
});

describe('GeoColumnDetector.matchAgainstSamples', () => {
  it('matches known country names', () => {
    const values = ['FRANCE', 'GERMANY', 'SPAIN'];
    const score = GeoColumnDetector.matchAgainstSamples(values, [
      'FRANCE',
      'GERMANY',
      'SPAIN',
      'ITALY'
    ]);
    expect(score).toBe(1);
  });

  it('matches accentless equivalents (normalization)', () => {
    const values = ['ile de france', 'normandie'];
    const score = GeoColumnDetector.matchAgainstSamples(values, [
      'ILE-DE-FRANCE',
      'NORMANDIE'
    ]);
    expect(score).toBeGreaterThan(0);
  });
});

describe('GeoColumnDetector.detectByHeader', () => {
  it('detects latitude from "lat" header with numeric values', () => {
    const values = ['48.8', '51.5', '-33.9', '40.7'];
    const result = GeoColumnDetector.detectByHeader('lat', values);
    expect(result?.type).toBe('latitude');
    expect(result?.confidence).toBeGreaterThan(0.5);
  });

  it('detects ISO2 from "iso2" header keyword with matching values', () => {
    const values = ['FR', 'DE', 'US', 'GB', 'IT', 'ES'];
    const result = GeoColumnDetector.detectByHeader('iso2', values);
    expect(result?.type).toBe('iso2');
  });

  it('detects numeric commune code headers as city-level geography', () => {
    const values = ['97212', '10268', '10305', '10350'];
    const result = GeoColumnDetector.detectByHeader(
      'Code INSEE Commune',
      values
    );
    expect(result?.type).toBe('city');
  });

  it('prefers city-level columns over region-level columns as the primary geography', async () => {
    const result = await GeoColumnDetector.detectGeoColumns(
      ['Code INSEE Commune', 'Code Département'],
      [
        ['97212', '972'],
        ['10268', '10'],
        ['10305', '10'],
        ['10350', '10']
      ]
    );

    expect(result.geoColumns.map((column) => column.columnName)).toContain(
      'Code INSEE Commune'
    );
    expect(result.suggestedPrimaryGeoColumn?.columnName).toBe(
      'Code INSEE Commune'
    );
  });
});

describe('GeoColumnDetector.detectColumnType arbitration', () => {
  const ISO2_VALUES = [
    'FR',
    'DE',
    'US',
    'GB',
    'IT',
    'ES',
    'PL',
    'NL',
    'BE',
    'PT'
  ];

  it('keeps the max confidence and merges matchedPatterns when header and values agree', () => {
    const result = GeoColumnDetector.detectColumnType('iso2', ISO2_VALUES);
    expect(result?.type).toBe('iso2');
    expect(result?.confidence).toBe(1);
    expect(result?.matchedPatterns).toEqual(
      expect.arrayContaining(['Header keywords: ISO2', 'Value pattern: ISO2'])
    );
  });

  it('lets the value subtype win when its confidence exceeds the header by more than 0.15', () => {
    const headerOnly = GeoColumnDetector.detectByHeader('entity', ISO2_VALUES);
    expect(headerOnly?.type).toBe('country_name');

    const result = GeoColumnDetector.detectColumnType('entity', ISO2_VALUES);
    expect(result?.type).toBe('iso2');
  });

  it('keeps the header type when the value subtype does not beat it by more than 0.15', () => {
    const regionValues = ['NORMANDIE', 'BRETAGNE', 'OCCITANIE', 'CORSE'];
    const headerOnly = GeoColumnDetector.detectByHeader(
      'country',
      regionValues
    );
    expect(headerOnly?.type).toBe('country_name');

    const valueOnly = GeoColumnDetector.detectByValues(regionValues);
    expect(valueOnly?.type).toBe('region');
    expect(valueOnly?.confidence).toBeLessThanOrEqual(
      (headerOnly?.confidence ?? 0) + 0.15
    );

    const result = GeoColumnDetector.detectColumnType('country', regionValues);
    expect(result?.type).toBe('country_name');
  });
});

describe('resolveGPSCoordinateColumns', () => {
  it('resolves lat/lon by column name pattern', () => {
    const columns = [{ name: 'lat' }, { name: 'lon' }, { name: 'population' }];
    const result = resolveGPSCoordinateColumns(columns);
    expect(result).not.toBeNull();
    expect(result?.lat).toBe('lat');
    expect(result?.lon).toBe('lon');
  });

  it('returns null when no coordinate columns found', () => {
    const columns = [{ name: 'country' }, { name: 'population' }];
    expect(resolveGPSCoordinateColumns(columns)).toBeNull();
  });

  it('returns null when only lat is present (no lon)', () => {
    const columns = [{ name: 'lat' }, { name: 'country' }];
    expect(resolveGPSCoordinateColumns(columns)).toBeNull();
  });

  it('resolves numeric x/y columns through the semio geolat/geolon path', () => {
    const columns = [
      { name: 'x', semioType: 'geolon' },
      { name: 'y', semioType: 'geolat' },
      { name: 'habitants' }
    ];
    const result = resolveGPSCoordinateColumns(columns);
    expect(result?.lat).toBe('y');
    expect(result?.lon).toBe('x');
  });

  it('prefers geo_detection metadata over name heuristics', () => {
    const columns = [{ name: 'col_a' }, { name: 'col_b' }];
    const geoDetection = {
      geoColumns: [
        {
          columnName: 'col_a',
          type: 'latitude' as const,
          confidence: 0.95,
          index: 0
        },
        {
          columnName: 'col_b',
          type: 'longitude' as const,
          confidence: 0.95,
          index: 1
        }
      ]
    };
    const result = resolveGPSCoordinateColumns(columns, geoDetection);
    expect(result?.lat).toBe('col_a');
    expect(result?.lon).toBe('col_b');
  });
});
