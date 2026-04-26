import { untrack } from 'svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  haveCategoryLabelsChanged,
  resolveCategoryLabels,
  type ResolveCategoryLabelsOptions
} from './use-category-labels.svelte';

export const CATEGORY_LABEL_FETCH_ERROR = {
  FILL: 'Failed to fetch category labels',
  STROKE: 'Failed to fetch stroke category labels',
  SYMBOL_FILL: 'Failed to fetch symbol fill category labels',
  TEXT_BACKGROUND: 'Failed to fetch text background category labels',
  TEXT_BACKGROUND_STROKE:
    'Failed to fetch text background stroke category labels'
} as const;

export type CategoryLabelFetchError =
  (typeof CATEGORY_LABEL_FETCH_ERROR)[keyof typeof CATEGORY_LABEL_FETCH_ERROR];

export type CategoryLabelsDataset = ResolveCategoryLabelsOptions['dataset'];

export interface FetchCategoryLabelsOptions {
  dataset: CategoryLabelsDataset;
  column: string;
  getCurrentLabels: () => readonly string[] | undefined;
  applyLabels: (labels: string[]) => void;
  useUntrack?: boolean;
  errorMessage: CategoryLabelFetchError;
  signal?: AbortSignal;
  getFallbackValues: (datasetId: string, columnName: string) => unknown[];
}

export async function fetchClassificationLabels(
  options: FetchCategoryLabelsOptions
): Promise<void> {
  try {
    const labels = await resolveCategoryLabels({
      dataset: options.dataset,
      columnName: options.column,
      getFallbackValues: (columnName) =>
        options.dataset?.id
          ? options.getFallbackValues(options.dataset.id, columnName)
          : []
    });

    if (options.signal?.aborted) {
      return;
    }

    if (
      labels.length === 0 ||
      !haveCategoryLabelsChanged(options.getCurrentLabels(), labels)
    ) {
      return;
    }

    if (options.useUntrack) {
      untrack(() => options.applyLabels(labels));
      return;
    }

    options.applyLabels(labels);
  } catch (error) {
    if (options.signal?.aborted) {
      return;
    }
    logger.warn(options.errorMessage, LogCategory.VISUALIZATION, error);
  }
}

export interface CategoryLabelsFetcher {
  controller: AbortController;
  abort: () => void;
  fetchClassificationLabels: (
    options: Omit<FetchCategoryLabelsOptions, 'getFallbackValues' | 'signal'>
  ) => Promise<void>;
}

export function createCategoryLabelsFetcher(
  getFallbackValues: (datasetId: string, columnName: string) => unknown[]
): CategoryLabelsFetcher {
  let controller = new AbortController();

  return {
    get controller() {
      return controller;
    },
    abort() {
      controller.abort();
      controller = new AbortController();
    },
    fetchClassificationLabels(
      options: Omit<FetchCategoryLabelsOptions, 'getFallbackValues' | 'signal'>
    ) {
      return fetchClassificationLabels({
        ...options,
        getFallbackValues,
        signal: controller.signal
      });
    }
  };
}
