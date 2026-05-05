import { describe, expect, it } from 'vitest';
import { ColumnType } from '$lib/features/data-pipeline/types';
import {
  collectYearValues,
  collectYearValuesFromRows,
  isLikelyYearColumn,
  parseYearValue
} from '$lib/features/visualization-tab/utils/year-filter.utils';

// ─── parseYearValue ────────────────────────────────────────────────────────

describe('parseYearValue — valid ranges', () => {
  it('parses integer numbers inside [1000, 3000]', () => {
    expect(parseYearValue(1984)).toBe(1984);
    expect(parseYearValue(2026)).toBe(2026);
    expect(parseYearValue(1000)).toBe(1000);
    expect(parseYearValue(3000)).toBe(3000);
  });

  it('parses integer strings', () => {
    expect(parseYearValue('2024')).toBe(2024);
    expect(parseYearValue('  1999  ')).toBe(1999);
  });

  it('parses BigInt values', () => {
    expect(parseYearValue(2024n)).toBe(2024);
  });
});

describe('parseYearValue — rejections', () => {
  it('rejects values outside [1000, 3000]', () => {
    expect(parseYearValue(999)).toBeNull();
    expect(parseYearValue(3001)).toBeNull();
    expect(parseYearValue(-1984)).toBeNull();
  });

  it('rejects non-integer numbers', () => {
    expect(parseYearValue(2024.5)).toBeNull();
    expect(parseYearValue(NaN)).toBeNull();
    expect(parseYearValue(Infinity)).toBeNull();
  });

  it('rejects non-parseable strings', () => {
    expect(parseYearValue('abc')).toBeNull();
    expect(parseYearValue('')).toBeNull();
    expect(parseYearValue('   ')).toBeNull();
  });

  it('rejects null / undefined / other types', () => {
    expect(parseYearValue(null)).toBeNull();
    expect(parseYearValue(undefined)).toBeNull();
    expect(parseYearValue({})).toBeNull();
    expect(parseYearValue([])).toBeNull();
    expect(parseYearValue(true)).toBeNull();
  });
});

// ─── isLikelyYearColumn ────────────────────────────────────────────────────

describe('isLikelyYearColumn — non-numeric always false', () => {
  it('returns false for string columns even if name matches', () => {
    expect(isLikelyYearColumn({ name: 'year', type: ColumnType.TEXT })).toBe(
      false
    );
  });
});

describe('isLikelyYearColumn — name pattern match', () => {
  it('matches "year"', () => {
    expect(isLikelyYearColumn({ name: 'year', type: ColumnType.NUMBER })).toBe(
      true
    );
  });

  it('matches "annee" and "année"', () => {
    expect(isLikelyYearColumn({ name: 'annee', type: ColumnType.NUMBER })).toBe(
      true
    );
    expect(isLikelyYearColumn({ name: 'année', type: ColumnType.NUMBER })).toBe(
      true
    );
  });

  it('matches case-insensitively', () => {
    expect(isLikelyYearColumn({ name: 'YEAR', type: ColumnType.NUMBER })).toBe(
      true
    );
  });

  it('matches names embedding "year"', () => {
    expect(
      isLikelyYearColumn({ name: 'birth_year', type: ColumnType.NUMBER })
    ).toBe(true);
  });
});

describe('isLikelyYearColumn — stats-based detection', () => {
  it('returns true when stats are year-like (min/max + integers)', () => {
    expect(
      isLikelyYearColumn({
        name: 'value',
        type: ColumnType.NUMBER,
        stats: { min: 2000, max: 2024, share_integers: 1, uniques: 25 }
      })
    ).toBe(true);
  });

  it('returns false when share of integers < 0.8', () => {
    expect(
      isLikelyYearColumn({
        name: 'value',
        type: ColumnType.NUMBER,
        stats: { min: 2000, max: 2024, share_integers: 0.5, uniques: 25 }
      })
    ).toBe(false);
  });

  it('returns false when range spans > 250 years', () => {
    expect(
      isLikelyYearColumn({
        name: 'value',
        type: ColumnType.NUMBER,
        stats: { min: 1000, max: 2500, share_integers: 1, uniques: 50 }
      })
    ).toBe(false);
  });

  it('returns false when min > max', () => {
    expect(
      isLikelyYearColumn({
        name: 'value',
        type: ColumnType.NUMBER,
        stats: { min: 2024, max: 2000, share_integers: 1, uniques: 25 }
      })
    ).toBe(false);
  });
});

describe('isLikelyYearColumn — rows-based fallback', () => {
  it('returns true when ≥80% of non-null rows are valid years', () => {
    const rows = [
      { v: 2020 },
      { v: 2021 },
      { v: 2022 },
      { v: 2023 },
      { v: 'bad' }
    ];
    expect(
      isLikelyYearColumn({ name: 'v', type: ColumnType.NUMBER }, rows)
    ).toBe(true);
  });

  it('returns false when <80% valid', () => {
    const rows = [{ v: 2020 }, { v: 'a' }, { v: 'b' }, { v: 'c' }];
    expect(
      isLikelyYearColumn({ name: 'v', type: ColumnType.NUMBER }, rows)
    ).toBe(false);
  });

  it('ignores null/undefined/empty-string values', () => {
    const rows = [
      { v: 2020 },
      { v: null },
      { v: undefined },
      { v: '' },
      { v: 2021 }
    ];
    expect(
      isLikelyYearColumn({ name: 'v', type: ColumnType.NUMBER }, rows)
    ).toBe(true);
  });

  it('returns false for empty rows with no name/stats match', () => {
    expect(isLikelyYearColumn({ name: 'v', type: ColumnType.NUMBER }, [])).toBe(
      false
    );
  });
});

// ─── collectYearValuesFromRows ────────────────────────────────────────────

describe('collectYearValuesFromRows', () => {
  it('returns deduplicated sorted year values', () => {
    const rows = [{ y: 2020 }, { y: 2018 }, { y: 2020 }, { y: 2024 }];
    expect(collectYearValuesFromRows(rows, 'y')).toEqual([2018, 2020, 2024]);
  });

  it('ignores invalid years', () => {
    const rows = [{ y: 2020 }, { y: 'bad' }, { y: 9999 }, { y: 2024 }];
    expect(collectYearValuesFromRows(rows, 'y')).toEqual([2020, 2024]);
  });

  it('returns empty array when no valid years', () => {
    expect(collectYearValuesFromRows([{ y: 'a' }, { y: null }], 'y')).toEqual(
      []
    );
  });
});

// ─── collectYearValues ────────────────────────────────────────────────────

describe('collectYearValues', () => {
  it('accepts any iterable of values', () => {
    expect(collectYearValues([2020, 2018, 2024])).toEqual([2018, 2020, 2024]);
    expect(collectYearValues(new Set([2024, 2020]))).toEqual([2020, 2024]);
  });

  it('deduplicates and sorts ascending', () => {
    expect(collectYearValues([2020, 2020, 2018, 2024, 2018])).toEqual([
      2018, 2020, 2024
    ]);
  });
});
