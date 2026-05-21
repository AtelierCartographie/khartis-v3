import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveCategoryLabelsMock = vi.fn();
const haveCategoryLabelsChangedMock = vi.fn();

vi.mock('./use-category-labels.svelte', () => ({
  resolveCategoryLabels: (...args: unknown[]) =>
    resolveCategoryLabelsMock(...args),
  haveCategoryLabelsChanged: (...args: unknown[]) =>
    haveCategoryLabelsChangedMock(...args)
}));

import {
  CATEGORY_LABEL_FETCH_ERROR,
  createCategoryLabelsFetcher
} from './use-category-labels-fetcher.svelte';

describe('use-category-labels-fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    haveCategoryLabelsChangedMock.mockReturnValue(true);
  });

  it('exposes a fresh AbortController on creation', () => {
    const fetcher = createCategoryLabelsFetcher(() => []);
    expect(fetcher.controller.signal.aborted).toBe(false);
  });

  it('aborts current controller and creates a new one on abort()', () => {
    const fetcher = createCategoryLabelsFetcher(() => []);
    const previousController = fetcher.controller;
    fetcher.abort();
    expect(previousController.signal.aborted).toBe(true);
    expect(fetcher.controller).not.toBe(previousController);
    expect(fetcher.controller.signal.aborted).toBe(false);
  });

  it('applies labels when resolved labels changed', async () => {
    const applyLabels = vi.fn();
    resolveCategoryLabelsMock.mockResolvedValue(['A', 'B']);
    const fetcher = createCategoryLabelsFetcher(() => []);

    await fetcher.fetchClassificationLabels({
      dataset: { id: 'ds-1' },
      column: 'cat',
      getCurrentLabels: () => [],
      applyLabels,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.FILL
    });

    expect(applyLabels).toHaveBeenCalledWith(['A', 'B']);
  });

  it('skips applyLabels when labels are unchanged', async () => {
    const applyLabels = vi.fn();
    resolveCategoryLabelsMock.mockResolvedValue(['A', 'B']);
    haveCategoryLabelsChangedMock.mockReturnValue(false);
    const fetcher = createCategoryLabelsFetcher(() => []);

    await fetcher.fetchClassificationLabels({
      dataset: { id: 'ds-1' },
      column: 'cat',
      getCurrentLabels: () => ['A', 'B'],
      applyLabels,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.FILL
    });

    expect(applyLabels).not.toHaveBeenCalled();
  });

  it('skips applyLabels when fetch returns empty array', async () => {
    const applyLabels = vi.fn();
    resolveCategoryLabelsMock.mockResolvedValue([]);
    const fetcher = createCategoryLabelsFetcher(() => []);

    await fetcher.fetchClassificationLabels({
      dataset: { id: 'ds-1' },
      column: 'cat',
      getCurrentLabels: () => [],
      applyLabels,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.FILL
    });

    expect(applyLabels).not.toHaveBeenCalled();
  });

  it('skips applying labels when resolveCategoryLabels rejects', async () => {
    const applyLabels = vi.fn();
    resolveCategoryLabelsMock.mockRejectedValue(new Error('boom'));
    const fetcher = createCategoryLabelsFetcher(() => []);

    await fetcher.fetchClassificationLabels({
      dataset: { id: 'ds-1' },
      column: 'cat',
      getCurrentLabels: () => [],
      applyLabels,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.FILL
    });

    expect(applyLabels).not.toHaveBeenCalled();
  });

  it('does not apply labels when controller is aborted before fetch resolves', async () => {
    const applyLabels = vi.fn();
    let resolveFn: (labels: string[]) => void = () => {};
    resolveCategoryLabelsMock.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFn = resolve;
        })
    );
    const fetcher = createCategoryLabelsFetcher(() => []);

    const fetchPromise = fetcher.fetchClassificationLabels({
      dataset: { id: 'ds-1' },
      column: 'cat',
      getCurrentLabels: () => [],
      applyLabels,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.FILL
    });

    fetcher.abort();
    resolveFn(['A', 'B']);
    await fetchPromise;

    expect(applyLabels).not.toHaveBeenCalled();
  });
});
