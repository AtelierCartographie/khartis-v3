import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';

type CategoryDatasetLike = {
  tableName?: string;
  data?: Array<Record<string, unknown>> | null;
};

type CategoryClassificationLike = Partial<
  Pick<ClassificationConfig, 'labels' | 'colors' | 'numClasses' | 'classes'>
>;

export function collectDistinctCategoryLabels(values: unknown[]): string[] {
  const labels: string[] = [];

  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    const label = String(value).trim();
    if (!label || labels.includes(label)) {
      continue;
    }

    labels.push(label);
  }

  return labels;
}

export function resolveCategoryPreviewCount(
  classification: CategoryClassificationLike | undefined,
  fallbackCount = 4,
  labels: string[] = []
): number {
  return (
    labels.length ||
    classification?.labels?.length ||
    classification?.colors?.length ||
    classification?.numClasses ||
    classification?.classes ||
    fallbackCount ||
    4
  );
}

export async function loadDistinctCategoryLabels(
  dataset: CategoryDatasetLike | undefined,
  columnName: string | undefined
): Promise<string[]> {
  if (!dataset || !columnName) {
    return [];
  }

  const localRows = dataset.data ?? [];

  if (!dataset.tableName) {
    return collectDistinctCategoryLabels(
      localRows.map((row) => row?.[columnName])
    );
  }

  try {
    const escapedTable = escapeIdentifier(dataset.tableName);
    const escapedColumn = escapeIdentifier(columnName);
    const rows = (await Duck.query(
      `SELECT DISTINCT "${escapedColumn}" AS category_value
       FROM "${escapedTable}"
       WHERE "${escapedColumn}" IS NOT NULL
       ORDER BY 1`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    const queriedLabels = collectDistinctCategoryLabels(
      rows.map((row) => row.category_value)
    );

    if (queriedLabels.length > 0) {
      return queriedLabels;
    }
  } catch {
    return collectDistinctCategoryLabels(
      localRows.map((row) => row?.[columnName])
    );
  }

  return collectDistinctCategoryLabels(
    localRows.map((row) => row?.[columnName])
  );
}
