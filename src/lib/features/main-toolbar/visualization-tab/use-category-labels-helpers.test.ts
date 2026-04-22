import { beforeEach, describe, expect, it, vi } from 'vitest';

const previewMocks = vi.hoisted(() => ({
  collectDistinctCategoryLabels: vi.fn((values: unknown[]) =>
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  ),
  loadDistinctCategoryLabels: vi.fn(),
  resolveCategoryPreviewCount: vi.fn(() => 4)
}));

vi.mock('./components/shared/categorical-preview.utils', () => ({
  ...previewMocks
}));

import {
  haveCategoryLabelsChanged,
  resolveCategoryLabels
} from './use-category-labels.svelte';

describe('use-category-labels helpers', () => {
  beforeEach(() => {
    previewMocks.collectDistinctCategoryLabels.mockClear();
    previewMocks.loadDistinctCategoryLabels.mockReset();
  });

  it('detects unchanged labels precisely', () => {
    expect(haveCategoryLabelsChanged(['A', 'B'], ['A', 'B'])).toBe(false);
    expect(haveCategoryLabelsChanged(['A'], ['A', 'B'])).toBe(true);
    expect(haveCategoryLabelsChanged(undefined, ['A'])).toBe(true);
  });

  it('uses fallback values when distinct-label loading returns nothing', async () => {
    previewMocks.loadDistinctCategoryLabels.mockResolvedValue([]);

    const labels = await resolveCategoryLabels({
      dataset: { tableName: 'dataset' },
      columnName: 'region',
      getFallbackValues: () => ['North', 'South']
    });

    expect(previewMocks.loadDistinctCategoryLabels).toHaveBeenCalledWith(
      { tableName: 'dataset' },
      'region'
    );
    expect(previewMocks.collectDistinctCategoryLabels).toHaveBeenCalledWith([
      'North',
      'South'
    ]);
    expect(labels).toEqual(['North', 'South']);
  });
});
