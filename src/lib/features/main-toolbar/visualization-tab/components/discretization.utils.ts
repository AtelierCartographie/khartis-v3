import type {
  ClassificationConfig,
  ClassificationMethod
} from '$lib/features/commons/store/visualization.store.svelte';
import * as m from '$lib/paraglide/messages.js';

export const DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX = 12;

export const NESTED_MEANS_CLASS_COUNTS = [2, 4, 8, 16] as const;

export function normalizeClassificationMethod(
  method: ClassificationMethod
): ClassificationMethod {
  return method;
}

/**
 * Snaps a requested class count to the nearest valid nested-means level.
 * Nested means is recursive (each pass doubles the cuts) so only powers of 2
 * are meaningful. Inputs <2 collapse to 2; ties favour the lower power of 2.
 */
export function resolveNestedMeansClassCount(
  requestedClassCount: number
): number {
  const safeRequested = Math.max(2, Math.floor(requestedClassCount));

  return NESTED_MEANS_CLASS_COUNTS.reduce((closest, current) =>
    Math.abs(current - safeRequested) < Math.abs(closest - safeRequested)
      ? current
      : closest
  );
}

export function resolveRequestedClassCount(
  method: ClassificationMethod,
  requestedClassCount: number
): number {
  const normalizedMethod = normalizeClassificationMethod(method);
  const safeRequested = Math.max(2, Math.floor(requestedClassCount));

  if (normalizedMethod === 'q6') {
    return 6;
  }

  if (normalizedMethod === 'nested_means') {
    return resolveNestedMeansClassCount(safeRequested);
  }

  return safeRequested;
}

export function resolveComputedClassCount(
  method: ClassificationMethod,
  requestedClassCount: number,
  actualClassCount: number
): number {
  const normalizedMethod = normalizeClassificationMethod(method);
  const safeRequested = resolveRequestedClassCount(
    normalizedMethod,
    requestedClassCount
  );

  if (
    (normalizedMethod === 'head_tail' ||
      normalizedMethod === 'standard_deviation') &&
    Number.isFinite(actualClassCount) &&
    actualClassCount >= 2
  ) {
    return Math.min(safeRequested, Math.floor(actualClassCount));
  }

  return safeRequested;
}

export function resolveHeadTailClassCountMax(
  actualClassCount?: number | null
): number {
  if (
    typeof actualClassCount === 'number' &&
    Number.isFinite(actualClassCount) &&
    actualClassCount >= 2
  ) {
    return Math.floor(actualClassCount);
  }

  return DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
}

const METHOD_LABELS: Record<string, () => string> = {
  jenks: m.discretization_method_jenks,
  quantiles: m.discretization_method_quantile,
  equal_interval: m.discretization_method_equal_interval,
  standard_deviation: m.discretization_method_stddev,
  manual: m.discretization_method_manual,
  q6: m.discretization_method_q6,
  nested_means: m.discretization_method_nested_means,
  head_tail: m.discretization_method_head_tail
};

export function resolveDiscretizationLabel(
  classification: ClassificationConfig | undefined
): string {
  const method = classification?.method ?? 'jenks';
  const numClasses = classification?.numClasses ?? classification?.classes ?? 5;
  const methodLabel = METHOD_LABELS[method]?.() ?? String(method);

  return `${methodLabel}, ${numClasses} classes`;
}
