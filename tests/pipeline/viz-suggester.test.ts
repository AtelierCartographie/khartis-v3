import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  DuckDBSimplifiedType: {
    NUMERIC: 'numeric',
    BOOLEAN: 'boolean',
    DATE: 'date',
    STRING: 'string',
    GEOMETRY: 'geometry',
    OTHER: 'other'
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
  LogCategory: { VISUALIZATION: 'VISUALIZATION' }
}));

import { vizSuggester } from '$lib/features/commons/services/viz-suggester.service';
import type { ColumnAnalysis } from '$lib/features/data-pipeline/types';

function col(
  overrides: Partial<ColumnAnalysis> & { name: string }
): ColumnAnalysis {
  return {
    type: 'string',
    stats: { totalCount: 100, uniqueCount: 10, nullCount: 0 },
    ...overrides
  };
}

const qlCol = col({
  name: 'land_use',
  type: 'string',
  stats: { totalCount: 200, uniqueCount: 8, nullCount: 0 }
});

const qtaCol = col({
  name: 'population',
  type: 'number',
  stats: {
    totalCount: 100,
    uniqueCount: 50,
    nullCount: 0,
    share_integers: 1.0,
    share_rank_interval: 0.05,
    extent_magnitude: 3,
    min: 1000,
    max: 1000000
  }
});

const boundedPopulationCol = col({
  name: 'population_2024',
  type: 'number',
  stats: {
    totalCount: 3,
    uniqueCount: 3,
    nullCount: 0,
    min: 80,
    max: 160,
    share_integers: 1.0,
    share_floats: 0,
    share_rank_interval: 0,
    extent_magnitude: 1
  }
});

const geoidCol = col({
  name: 'iso',
  type: 'string',
  stats: { totalCount: 100, uniqueCount: 100, nullCount: 0 }
});

const geometryCol = col({
  name: 'geom',
  type: 'geometry',
  stats: { totalCount: 100, uniqueCount: 100, nullCount: 0 }
});

const latitudeCol = col({
  name: 'lat',
  type: 'number',
  geo_type: 'latitude',
  geo_confidence: 0.98,
  stats: {
    totalCount: 100,
    uniqueCount: 100,
    nullCount: 0,
    min: 42,
    max: 49,
    share_floats: 1
  }
});

const longitudeCol = col({
  name: 'lon',
  type: 'number',
  geo_type: 'longitude',
  geo_confidence: 0.98,
  stats: {
    totalCount: 100,
    uniqueCount: 100,
    nullCount: 0,
    min: 1,
    max: 7,
    share_floats: 1
  }
});

const constantCol = col({
  name: 'flag',
  type: 'string',
  stats: { totalCount: 100, uniqueCount: 1, nullCount: 0 }
});

describe('suggestVisualizations — guard', () => {
  it('returns empty array when geometryType is null', () => {
    expect(vizSuggester.suggestVisualizations([qlCol], null)).toEqual([]);
  });

  it('returns empty array for null geometry even with many columns', () => {
    expect(vizSuggester.suggestVisualizations([qlCol, qtaCol], null)).toEqual(
      []
    );
  });
});

describe('suggestVisualizations — no thematic columns', () => {
  it('returns nbColumns=0 suggestions for Polygon with empty column list', () => {
    const results = vizSuggester.suggestVisualizations([], 'Polygon');
    expect(results.length).toBeGreaterThan(0);
    for (const s of results) expect(s.nbColumns).toBe(0);
  });

  it('GEOID-only column falls back to nbColumns=0 suggestions', () => {
    const results = vizSuggester.suggestVisualizations([geoidCol], 'Polygon');
    for (const s of results) expect(s.nbColumns).toBe(0);
  });

  it('uniqueCount=1 column falls back to nbColumns=0 suggestions', () => {
    const results = vizSuggester.suggestVisualizations(
      [constantCol],
      'Polygon'
    );
    for (const s of results) expect(s.nbColumns).toBe(0);
  });

  it('geometry-only column falls back to nbColumns=0 suggestions', () => {
    const results = vizSuggester.suggestVisualizations(
      [geometryCol],
      'Polygon'
    );
    for (const s of results) expect(s.nbColumns).toBe(0);
  });
});

describe('suggestVisualizations — Polygon thematic', () => {
  it('includes polygons_colorful_QL for a QL string column', () => {
    const results = vizSuggester.suggestVisualizations([qlCol], 'Polygon');
    const ids = results.map((s) => s.id);
    expect(ids).toContain('polygons_colorful_QL');
  });

  it('returns suggestions referencing the column name', () => {
    const results = vizSuggester.suggestVisualizations([qlCol], 'Polygon');
    const withColumn = results.filter((s) => s.columns?.includes('land_use'));
    expect(withColumn.length).toBeGreaterThan(0);
  });

  it('keeps bounded absolute numeric columns eligible on Polygon datasets', () => {
    const results = vizSuggester.suggestVisualizations(
      [boundedPopulationCol],
      'Polygon',
      { maxSuggestions: 10 }
    );
    const withColumn = results.filter((s) =>
      s.columns?.includes('population_2024')
    );
    expect(withColumn.length).toBeGreaterThan(0);
    expect(withColumn.map((s) => s.id)).toContain('symbols_proportional');
  });

  it('GEOID column does not appear in suggestion columns', () => {
    const results = vizSuggester.suggestVisualizations(
      [geoidCol, qlCol],
      'Polygon'
    );
    for (const s of results) {
      expect(s.columns ?? []).not.toContain('iso');
    }
  });

  it('geometry columns do not appear in suggestion columns', () => {
    const results = vizSuggester.suggestVisualizations(
      [geometryCol, qlCol],
      'Polygon'
    );
    for (const s of results) {
      expect(s.columns ?? []).not.toContain('geom');
    }
  });
});

describe('suggestVisualizations — Point thematic', () => {
  it('includes symbols_proportional for a QTA numeric column on Point', () => {
    const results = vizSuggester.suggestVisualizations([qtaCol], 'Point', {
      maxSuggestions: 10
    });
    const ids = results.map((s) => s.id);
    expect(ids).toContain('symbols_proportional');
  });

  it('geo-detected coordinate columns do not appear in suggestion columns', () => {
    const results = vizSuggester.suggestVisualizations(
      [latitudeCol, longitudeCol, qlCol, qtaCol],
      'Point',
      { maxSuggestions: 10 }
    );

    for (const s of results) {
      expect(s.columns ?? []).not.toContain('lat');
      expect(s.columns ?? []).not.toContain('lon');
    }
  });
});

describe('suggestVisualizations — categorical legibility guards', () => {
  const tenCategoriesCol = col({
    name: 'commune_type',
    type: 'string',
    stats: { totalCount: 300, uniqueCount: 10, nullCount: 0 }
  });

  const sixCategoriesCol = col({
    name: 'land_cover',
    type: 'string',
    stats: { totalCount: 200, uniqueCount: 6, nullCount: 0 }
  });

  const nearUniqueCategoriesCol = col({
    name: 'commune_type',
    type: 'string',
    stats: { totalCount: 12, uniqueCount: 8, nullCount: 0 }
  });

  it('does not suggest categorical color viz above the color class limit', () => {
    const results = vizSuggester.suggestVisualizations(
      [tenCategoriesCol],
      'Polygon',
      { maxSuggestions: 10 }
    );
    const ids = results.map((s) => s.id);
    expect(ids).not.toContain('polygons_colorful_QL');
    expect(ids).not.toContain('symbols_differents');
  });

  it('does not suggest categorical viz when categories are nearly one per entity', () => {
    const results = vizSuggester.suggestVisualizations(
      [nearUniqueCategoriesCol],
      'Polygon',
      { maxSuggestions: 10 }
    );
    for (const s of results) {
      expect(s.columns ?? []).not.toContain('commune_type');
    }
  });

  it('keeps color categorical viz but drops shape viz between the two limits', () => {
    const results = vizSuggester.suggestVisualizations(
      [sixCategoriesCol],
      'Point',
      { maxSuggestions: 10 }
    );
    const ids = results.map((s) => s.id);
    expect(ids).toContain('symbols_uniques_colorful_QL');
    expect(ids).not.toContain('symbols_differents');
  });
});

describe('suggestVisualizations — weak thematic columns', () => {
  it('falls back to nbColumns=0 when the only column has a near-zero semio score', () => {
    const weakNumericCol = col({
      name: 'valeur',
      type: 'number',
      stats: {
        totalCount: 100,
        uniqueCount: 60,
        nullCount: 0,
        min: 200,
        max: 900,
        share_integers: 0.6,
        share_floats: 0.4,
        share_rank_interval: 0.5,
        extent_magnitude: 1
      }
    });
    const results = vizSuggester.suggestVisualizations(
      [weakNumericCol],
      'Polygon',
      { maxSuggestions: 10 }
    );
    for (const s of results) expect(s.nbColumns).toBe(0);
  });
});

describe('suggestVisualizations — maxSuggestions', () => {
  it('respects maxSuggestions=1', () => {
    const results = vizSuggester.suggestVisualizations(
      [qlCol, qtaCol],
      'Polygon',
      {
        maxSuggestions: 1
      }
    );
    expect(results).toHaveLength(1);
  });

  it('respects maxSuggestions=2', () => {
    const results = vizSuggester.suggestVisualizations(
      [qlCol, qtaCol],
      'Polygon',
      {
        maxSuggestions: 2
      }
    );
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('defaults to maxSuggestions=3', () => {
    const results = vizSuggester.suggestVisualizations(
      [qlCol, qtaCol, geoidCol, constantCol],
      'Polygon'
    );
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe('suggestVisualizations — ranking by confidence', () => {
  it('returns the best suggestion first in non-increasing score order', () => {
    const results = vizSuggester.suggestVisualizations(
      [qlCol, qtaCol],
      'Polygon',
      { maxSuggestions: 10 }
    );

    expect(results.length).toBeGreaterThan(1);

    const scores = results.map((s) => s.score ?? 0);
    const sortedDescending = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sortedDescending);
  });

  it('assigns every suggestion a finite score within 0..100', () => {
    const results = vizSuggester.suggestVisualizations(
      [qlCol, qtaCol],
      'Polygon',
      { maxSuggestions: 10 }
    );

    expect(results.length).toBeGreaterThan(0);
    for (const s of results) {
      expect(Number.isFinite(s.score)).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });
});
