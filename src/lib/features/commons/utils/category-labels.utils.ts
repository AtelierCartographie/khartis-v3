import type { ClassificationConfig } from '../stores/visualization.store.svelte';
import { Duck } from '$lib/features/duckdb';
import { sqlIdentifier } from '$lib/features/commons/utils/sql.utils';

type CategoryDatasetLike = {
  tableName?: string;
};

type CategoryClassificationLike = Partial<
  Pick<ClassificationConfig, 'labels' | 'colors' | 'numClasses' | 'classes'>
>;

export function collectDistinctCategoryLabels(values: unknown[]): string[] {
  const labels = new Set<string>();

  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    const label = String(value).trim();
    if (label) {
      labels.add(label);
    }
  }

  return [...labels];
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
  if (!dataset?.tableName || !columnName) {
    return [];
  }

  try {
    const rows = (await Duck.query(
      `SELECT DISTINCT ${sqlIdentifier(columnName)} AS category_value
       FROM ${sqlIdentifier(dataset.tableName)}
       WHERE ${sqlIdentifier(columnName)} IS NOT NULL
       ORDER BY 1`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    return collectDistinctCategoryLabels(rows.map((row) => row.category_value));
  } catch {
    return [];
  }
}
