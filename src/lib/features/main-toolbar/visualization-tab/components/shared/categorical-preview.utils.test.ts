import { afterEach, describe, expect, it, vi } from 'vitest';
import { Duck } from '$lib/features/duckdb';
import {
  collectDistinctCategoryLabels,
  loadDistinctCategoryLabels,
  resolveCategoryPreviewCount
} from './categorical-preview.utils';

describe('categorical-preview.utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deduplicates and trims category labels', () => {
    expect(
      collectDistinctCategoryLabels([
        ' public ',
        'private',
        'public',
        '',
        null,
        undefined,
        2024
      ])
    ).toEqual(['public', 'private', '2024']);
  });

  it('derives preview count from available classification data', () => {
    expect(resolveCategoryPreviewCount({ labels: ['A', 'B'] }, 4)).toBe(2);
    expect(resolveCategoryPreviewCount({ colors: ['#111', '#222'] }, 4)).toBe(
      2
    );
    expect(resolveCategoryPreviewCount({ numClasses: 5 }, 4)).toBe(5);
    expect(resolveCategoryPreviewCount(undefined, 0)).toBe(4);
  });

  it('falls back to local dataset rows when no DuckDB table exists', async () => {
    await expect(
      loadDistinctCategoryLabels(
        {
          data: [
            { category: 'public' },
            { category: 'private' },
            { category: 'public' }
          ]
        },
        'category'
      )
    ).resolves.toEqual(['public', 'private']);
  });

  it('falls back to local rows when DuckDB returns unlabeled array rows', async () => {
    vi.spyOn(Duck, 'query').mockResolvedValue([['public'], ['private']]);

    await expect(
      loadDistinctCategoryLabels(
        {
          tableName: 'demo_table',
          data: [{ category: 'public' }, { category: 'private' }]
        },
        'category'
      )
    ).resolves.toEqual(['public', 'private']);
  });
});
