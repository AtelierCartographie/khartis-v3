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

const geoidCol = col({
  name: 'iso',
  type: 'string',
  stats: { totalCount: 100, uniqueCount: 100, nullCount: 0 }
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

  it('GEOID column does not appear in suggestion columns', () => {
    const results = vizSuggester.suggestVisualizations(
      [geoidCol, qlCol],
      'Polygon'
    );
    for (const s of results) {
      expect(s.columns ?? []).not.toContain('iso');
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
