import { untrack } from 'svelte';
import {
  haveCategoryLabelsChanged,
  resolveCategoryLabels,
  type ResolveCategoryLabelsOptions
} from './use-category-labels.svelte';

import { m } from '$lib/paraglide/messages';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export const CATEGORY_LABEL_FETCH_ERROR = {
  get FILL() {
    return m.error_category_labels_fill();
  },
  get STROKE() {
    return m.error_category_labels_stroke();
  },
  get SYMBOL_FILL() {
    return m.error_category_labels_symbol_fill();
  }
} as const;

export type CategoryLabelFetchError = string;

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

    logger.error(options.errorMessage, LogCategory.DATA, {
      column: options.column,
      datasetId: options.dataset?.id,
      error
    });
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
