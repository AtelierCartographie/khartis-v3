import {
  loadDistinctCategoryLabels,
  resolveCategoryPreviewCount
} from './components/shared/categorical-preview.utils';
import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';

type CategoryDatasetLike = Parameters<typeof loadDistinctCategoryLabels>[0];
type CategoryClassificationLike = Partial<
  Pick<ClassificationConfig, 'labels' | 'colors' | 'numClasses' | 'classes'>
>;

interface UseCategoryLabelsOptions {
  enabled?: () => boolean;
  getDataset: () => CategoryDatasetLike | undefined;
  getColumnName: () => string | undefined;
  getClassification: () => CategoryClassificationLike | undefined;
  fallbackCount?: number | (() => number);
  onResolvedLabels?: (labels: string[]) => void;
}

export function useCategoryLabels({
  enabled = () => true,
  getDataset,
  getColumnName,
  getClassification,
  fallbackCount = 4,
  onResolvedLabels
}: UseCategoryLabelsOptions) {
  let labels = $state<string[]>([]);
  let requestId = 0;

  function resolveFallbackCount(): number {
    return typeof fallbackCount === 'function'
      ? fallbackCount()
      : fallbackCount;
  }

  $effect(() => {
    const currentClassification = getClassification();
    const persistedLabels = currentClassification?.labels ?? [];
    const currentRequestId = ++requestId;

    if (!enabled()) {
      labels = persistedLabels;
      return;
    }

    if (persistedLabels.length > 0) {
      labels = persistedLabels;
      return;
    }

    const dataset = getDataset();
    const columnName = getColumnName();
    if (!dataset || !columnName) {
      labels = [];
      return;
    }

    void loadDistinctCategoryLabels(dataset, columnName).then((nextLabels) => {
      if (currentRequestId !== requestId) {
        return;
      }

      labels = nextLabels;
      onResolvedLabels?.(nextLabels);
    });
  });

  const count = $derived(
    resolveCategoryPreviewCount(
      getClassification(),
      resolveFallbackCount(),
      labels
    )
  );

  return {
    get labels(): string[] {
      return labels;
    },
    get count(): number {
      return count;
    }
  };
}
