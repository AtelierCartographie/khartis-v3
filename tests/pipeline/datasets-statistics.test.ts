import { describe, expect, it } from 'vitest';
import { SvelteSet } from 'svelte/reactivity';

import type { DatasetsState } from '$lib/features/commons/store/datasets/datasets-state.svelte';
import { ColumnType } from '$lib/features/data-pipeline/types';
import { getColumnStatistics } from '$lib/features/commons/store/datasets/datasets-statistics';

describe('datasets statistics', () => {
  it('prefers full DuckDB column stats over preview rows for numeric columns', () => {
    const state: DatasetsState = {
      datasets: [
        {
          id: 'dataset-1',
          name: 'population.csv',
          sourceFileId: 'source-1',
          tableName: 'population_table',
          rowCount: 332,
          metadata: {
            processedAt: new Date('2026-04-04T00:00:00.000Z'),
            fileType: 'csv',
            parserUsed: 'test'
          },
          data: [{ population: 10 }, { population: 20 }],
          columns: [
            {
              name: 'population',
              values: [],
              type: ColumnType.NUMBER,
              stats: {
                name: 'population',
                type: ColumnType.NUMBER,
                count: 332,
                nulls: 0,
                uniques: 320,
                min: 30359,
                max: 15907951,
                mean: 2458340,
                median: 1800000
              }
            }
          ]
        }
      ],
      enabledDatasetIds: new SvelteSet<string>(),
      isProcessing: false,
      hiddenColumns: new Map<string, Set<string>>()
    };

    expect(getColumnStatistics(state, 'dataset-1', 'population')).toEqual({
      min: 30359,
      max: 15907951,
      mean: 2458340,
      median: 1800000,
      count: 332,
      nullCount: 0
    });
  });
});
