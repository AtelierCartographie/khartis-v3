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

import { detectSemioType } from '$lib/features/commons/utils/semio-detector.utils';

const NUMERIC = 'numeric';
const STRING = 'string';

function analysis(
  name: string,
  type_simple: string,
  overrides: Record<string, unknown> = {}
) {
  return { name, type_simple, count: 100, uniques: 50, nulls: 0, ...overrides };
}

describe('detectSemioType — STRING columns', () => {
  it('detects GEOID for id-keyword column with all-unique values', () => {
    const result = detectSemioType(
      analysis('country_id', STRING, {
        uniques: 100,
        share_rank_interval: 0
      }) as never
    );
    expect(result.semioType).toBe('geoid');
    expect(result.semioScore).toBeGreaterThan(0);
  });

  it('detects QL for low-cardinality category column', () => {
    const result = detectSemioType(
      analysis('land_use', STRING, {
        count: 200,
        uniques: 5,
        nulls: 0
      }) as never
    );
    expect(result.semioType).toBe('QL');
  });

  it('QL score increases when both shareUniques and uniqueCount are low', () => {
    const high = detectSemioType(
      analysis('cat', STRING, { count: 100, uniques: 5 }) as never
    );
    const low = detectSemioType(
      analysis('cat', STRING, { count: 100, uniques: 30 }) as never
    );
    expect(high.semioScore).toBeGreaterThan(low.semioScore);
  });
});

describe('detectSemioType — ordinal text categories', () => {
  it('detects QLO for ordered text categories (faible/moyen/élevé)', () => {
    const result = detectSemioType(
      analysis('risque', STRING, {
        count: 300,
        uniques: 3,
        categories: ['Faible', 'Moyen', 'Élevé']
      }) as never
    );
    expect(result.semioType).toBe('QLO');
  });

  it('detects QLO for numeric-prefixed category labels', () => {
    const result = detectSemioType(
      analysis('classe', STRING, {
        count: 300,
        uniques: 4,
        categories: ['1 - Très faible', '2 - Faible', '3 - Moyen', '4 - Élevé']
      }) as never
    );
    expect(result.semioType).toBe('QLO');
  });

  it('keeps unordered text categories as QL', () => {
    const result = detectSemioType(
      analysis('occupation_sol', STRING, {
        count: 300,
        uniques: 3,
        categories: ['Forêt', 'Prairie', 'Urbain']
      }) as never
    );
    expect(result.semioType).toBe('QL');
  });
});

describe('detectSemioType — NUMERIC columns', () => {
  it('detects GEOLAT for lat column with valid range', () => {
    const result = detectSemioType(
      analysis('lat', NUMERIC, {
        uniques: 100,
        min: -48,
        max: 48,
        share_integers: 0,
        share_floats: 1.0,
        share_rank_interval: 0,
        extent_magnitude: 1
      }) as never
    );
    expect(result.semioType).toBe('geolat');
  });

  it('detects GEOLON for lon column', () => {
    const result = detectSemioType(
      analysis('lon', NUMERIC, {
        uniques: 100,
        min: -10,
        max: 10,
        share_integers: 0,
        share_floats: 1.0,
        share_rank_interval: 0,
        extent_magnitude: 1
      }) as never
    );
    expect(result.semioType).toBe('geolon');
  });

  it('detects QTA for integer column with large extent', () => {
    const result = detectSemioType(
      analysis('population', NUMERIC, {
        uniques: 100,
        min: 1000,
        max: 1000000,
        share_integers: 1.0,
        share_floats: 0.0,
        share_rank_interval: 0.05,
        extent_magnitude: 3
      }) as never
    );
    expect(result.semioType).toBe('QTA');
  });

  it('does not classify bounded numeric thematic values as longitude without a coordinate keyword', () => {
    const result = detectSemioType(
      analysis('population_2024', NUMERIC, {
        uniques: 3,
        min: 80,
        max: 160,
        share_integers: 1.0,
        share_floats: 0,
        share_rank_interval: 0,
        extent_magnitude: 1
      }) as never
    );
    expect(result.semioType).toBe('QTA');
  });

  it('detects QTR for ratio-keyword float column', () => {
    const result = detectSemioType(
      analysis('taux_pauvrete', NUMERIC, {
        uniques: 100,
        min: 0,
        max: 1,
        share_integers: 0,
        share_floats: 0.95,
        share_rank_interval: 0.3,
        extent_magnitude: 1
      }) as never
    );
    expect(result.semioType).toBe('QTR');
  });

  it('detects QLO for rank-keyword column with high shareRankInterval', () => {
    const result = detectSemioType(
      analysis('rank_order', NUMERIC, {
        uniques: 50,
        min: 1,
        max: 50,
        share_integers: 1.0,
        share_floats: 0,
        share_rank_interval: 0.95,
        extent_magnitude: 1
      }) as never
    );
    expect(result.semioType).toBe('QLO');
  });

  it('detects GEOID for denormalized numeric code column (low shareUniques but id keyword)', () => {
    const result = detectSemioType(
      analysis('code_region_2016', NUMERIC, {
        count: 34953,
        uniques: 18,
        nulls: 0,
        min: 1,
        max: 94,
        share_integers: 1.0,
        share_floats: 0,
        share_rank_interval: 0,
        extent_magnitude: 1.97
      }) as never
    );
    expect(result.semioType).toBe('geoid');
    expect(result.semioScore).toBeGreaterThanOrEqual(0.6);
  });

  it('detects GEOID for denormalized string code column (code_departement)', () => {
    const result = detectSemioType(
      analysis('code_departement', STRING, {
        count: 34953,
        uniques: 96,
        nulls: 0
      }) as never
    );
    expect(result.semioType).toBe('geoid');
    expect(result.semioScore).toBeGreaterThanOrEqual(0.6);
  });

  it('does NOT classify as GEOID when id-keyword column has only 1 unique value', () => {
    const result = detectSemioType(
      analysis('code', STRING, {
        count: 100,
        uniques: 1,
        nulls: 0
      }) as never
    );
    expect(result.semioScore).toBe(0);
  });

  it('detects QLO for a year column (keyword + plausible range)', () => {
    const result = detectSemioType(
      analysis('Année', NUMERIC, {
        uniques: 30,
        min: 1990,
        max: 2020,
        share_integers: 1.0,
        share_floats: 0,
        share_rank_interval: 0.4,
        extent_magnitude: 0
      }) as never
    );
    expect(result.semioType).toBe('QLO');
  });

  it('detects QLO for a year column with BigInt min/max from DuckDB', () => {
    const result = detectSemioType(
      analysis('year', NUMERIC, {
        uniques: 30,
        min: 1990n,
        max: 2020n,
        share_integers: 1.0,
        share_floats: 0,
        share_rank_interval: 0.4,
        extent_magnitude: 0
      }) as never
    );
    expect(result.semioType).toBe('QLO');
  });

  it('does NOT treat a year-keyword column outside the plausible range as QLO', () => {
    const result = detectSemioType(
      analysis('annees_experience', NUMERIC, {
        uniques: 40,
        min: 0,
        max: 45,
        share_integers: 1.0,
        share_floats: 0,
        share_rank_interval: 0.05,
        extent_magnitude: 1
      }) as never
    );
    expect(result.semioType).not.toBe('QLO');
  });

  it('detects QTR for accented ratio keyword (densité) without explicit taux/rate', () => {
    const result = detectSemioType(
      analysis('densité', NUMERIC, {
        uniques: 90,
        min: 2,
        max: 900,
        share_integers: 0.1,
        share_floats: 0.9,
        share_rank_interval: 0,
        extent_magnitude: 2
      }) as never
    );
    expect(result.semioType).toBe('QTR');
  });

  it('QTA score is boosted by stock keywords vs anonymous integer column', () => {
    const stats = {
      uniques: 100,
      min: 1000,
      max: 1000000,
      share_integers: 1.0,
      share_floats: 0,
      share_rank_interval: 0.05,
      extent_magnitude: 3
    };
    const withKeyword = detectSemioType(
      analysis('total_naissances', NUMERIC, stats) as never
    );
    const withoutKeyword = detectSemioType(
      analysis('valeur', NUMERIC, stats) as never
    );
    expect(withKeyword.semioType).toBe('QTA');
    expect(withKeyword.semioScore).toBeGreaterThan(withoutKeyword.semioScore);
  });

  it('detects QTA for a heavily skewed decimal stock without any keyword', () => {
    const result = detectSemioType(
      analysis('pib_2022', NUMERIC, {
        uniques: 100,
        min: 0.4,
        max: 25000,
        share_integers: 0.05,
        share_floats: 0.95,
        share_rank_interval: 0,
        extent_magnitude: 5,
        skewness: 4.2
      }) as never
    );
    expect(result.semioType).toBe('QTA');
  });

  it('detects QTR for a bounded symmetric float column without any keyword', () => {
    const result = detectSemioType(
      analysis('valeur', NUMERIC, {
        uniques: 100,
        min: 3,
        max: 97,
        share_integers: 0.05,
        share_floats: 0.95,
        share_rank_interval: 0,
        extent_magnitude: 2,
        skewness: 0.2
      }) as never
    );
    expect(result.semioType).toBe('QTR');
  });

  it('normalizes scores to [0, 1] and exposes the runner-up type', () => {
    const result = detectSemioType(
      analysis('taux_pauvrete', NUMERIC, {
        uniques: 100,
        min: 0,
        max: 1,
        share_integers: 0,
        share_floats: 0.95,
        share_rank_interval: 0.3,
        extent_magnitude: 1
      }) as never
    );
    expect(result.semioType).toBe('QTR');
    expect(result.semioScore).toBeGreaterThan(0);
    expect(result.semioScore).toBeLessThanOrEqual(1);
    expect(result.runnerUp).toBeDefined();
    expect(result.runnerUp?.semioType).not.toBe('QTR');
    expect(result.runnerUp?.semioScore).toBeLessThanOrEqual(result.semioScore);
  });

  it('QTR score is boosted by ratio keywords vs plain float column', () => {
    const withKeyword = detectSemioType(
      analysis('taux', NUMERIC, {
        uniques: 50,
        min: 0,
        max: 1,
        share_integers: 0,
        share_floats: 0.9,
        share_rank_interval: 0.3,
        extent_magnitude: 1
      }) as never
    );
    const withoutKeyword = detectSemioType(
      analysis('valeur', NUMERIC, {
        uniques: 50,
        min: 0,
        max: 1,
        share_integers: 0,
        share_floats: 0.9,
        share_rank_interval: 0.3,
        extent_magnitude: 1
      }) as never
    );
    expect(withKeyword.semioScore).toBeGreaterThan(withoutKeyword.semioScore);
  });
});
