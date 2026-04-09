import { describe, expect, it } from 'vitest';

import { ColumnType } from '$lib/features/data-pipeline/types';
import {
  collectYearValues,
  collectYearValuesFromRows,
  isLikelyYearColumn,
  parseYearValue
} from '$lib/features/main-toolbar/visualization-tab/components/year-filter.utils';

describe('year filter utils', () => {
  it('parses reasonable year values only', () => {
    expect(parseYearValue('2024')).toBe(2024);
    expect(parseYearValue(1999)).toBe(1999);
    expect(parseYearValue(' 2021 ')).toBe(2021);
    expect(parseYearValue('999')).toBeNull();
    expect(parseYearValue('surface')).toBeNull();
    expect(parseYearValue(4200)).toBeNull();
  });

  it('detects year columns from full numeric stats even when preview rows are absent', () => {
    expect(
      isLikelyYearColumn({
        name: 'period',
        type: ColumnType.NUMBER,
        stats: {
          name: 'period',
          type: ColumnType.NUMBER,
          count: 400,
          nulls: 0,
          uniques: 4,
          min: 2021,
          max: 2024,
          share_integers: 1
        }
      })
    ).toBe(true);
  });

  it('does not misclassify arbitrary numeric metrics as years', () => {
    expect(
      isLikelyYearColumn({
        name: 'area_total',
        type: ColumnType.NUMBER,
        stats: {
          name: 'area_total',
          type: ColumnType.NUMBER,
          count: 240,
          nulls: 0,
          uniques: 240,
          min: 1200,
          max: 2800,
          share_integers: 1
        }
      })
    ).toBe(false);
  });

  it('falls back to preview rows when stats are unavailable', () => {
    expect(
      isLikelyYearColumn(
        {
          name: 'annee',
          type: ColumnType.NUMBER
        },
        [{ annee: 2020 }, { annee: 2021 }, { annee: 2022 }, { annee: 2023 }]
      )
    ).toBe(true);
  });

  it('collects distinct sorted year values from rows and query results', () => {
    const rows = [
      { year: 2024 },
      { year: '2022' },
      { year: 2024 },
      { year: null },
      { year: '2023' }
    ];

    expect(collectYearValuesFromRows(rows, 'year')).toEqual([2022, 2023, 2024]);
    expect(collectYearValues([2024, '2022', 2024, null, '2023'])).toEqual([
      2022, 2023, 2024
    ]);
  });
});
