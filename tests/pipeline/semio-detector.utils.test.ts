import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  DuckDBSimplifiedType: {
    NUMERIC: 'numeric',
    DATE: 'date',
    STRING: 'string'
  }
}));

import { DuckDBSimplifiedType } from '$lib/features/duckdb';
import {
  detectSemioType,
  SEMIO_TYPES
} from '$lib/features/commons/utils/semio-detector.utils';

describe('detectSemioType', () => {
  it('keeps sequential GIS ids as geoid', () => {
    const result = detectSemioType({
      name: 'OBJECTID',
      type_simple: DuckDBSimplifiedType.NUMERIC,
      count: 24,
      uniques: 24,
      nulls: 0,
      min: 1,
      max: 24,
      share_integers: 1,
      share_floats: 0,
      share_rank_interval: 1,
      extent_magnitude: 1.4
    });

    expect(result.semioType).toBe(SEMIO_TYPES.GEOID);
  });

  it('classifies unique numeric measures without id keywords as QTA', () => {
    const result = detectSemioType({
      name: 'valeur_test',
      type_simple: DuckDBSimplifiedType.NUMERIC,
      count: 18,
      uniques: 18,
      nulls: 0,
      min: 7,
      max: 42,
      share_integers: 1,
      share_floats: 0,
      share_rank_interval: 0.47,
      extent_magnitude: 1
    });

    expect(result.semioType).toBe(SEMIO_TYPES.QTA);
  });

  it('keeps numeric codes with id keywords as geoid even without sequential values', () => {
    const result = detectSemioType({
      name: 'code_postal',
      type_simple: DuckDBSimplifiedType.NUMERIC,
      count: 96,
      uniques: 64,
      nulls: 0,
      min: 75000,
      max: 95880,
      share_integers: 1,
      share_floats: 0,
      share_rank_interval: 0.03,
      extent_magnitude: 1
    });

    expect(result.semioType).toBe(SEMIO_TYPES.GEOID);
  });
});
