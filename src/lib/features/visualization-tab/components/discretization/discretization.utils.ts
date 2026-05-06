import type {
  ClassificationConfig,
  ClassificationMethod
} from '$lib/features/commons/stores/visualization.store.svelte';
import * as m from '$lib/paraglide/messages.js';

export const DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX = 12;

export const NESTED_MEANS_CLASS_COUNTS = [2, 4, 8, 16] as const;

const CLASSIFICATION_METHOD = {
  KMEANS: 'kmeans',
  QUANTILES: 'quantiles',
  EQUAL_INTERVAL: 'equal_interval',
  MANUAL: 'manual',
  Q6: 'q6',
  NESTED_MEANS: 'nested_means',
  HEAD_TAIL: 'head_tail'
} as const;

export function normalizeClassificationMethod(
  method: ClassificationMethod | string | null | undefined
): ClassificationMethod {
  switch (method) {
    case CLASSIFICATION_METHOD.KMEANS:
    case CLASSIFICATION_METHOD.QUANTILES:
    case CLASSIFICATION_METHOD.EQUAL_INTERVAL:
    case CLASSIFICATION_METHOD.MANUAL:
    case CLASSIFICATION_METHOD.Q6:
    case CLASSIFICATION_METHOD.NESTED_MEANS:
    case CLASSIFICATION_METHOD.HEAD_TAIL:
      return method as ClassificationMethod;
    default:
      return CLASSIFICATION_METHOD.KMEANS as ClassificationMethod;
  }
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
    normalizedMethod === CLASSIFICATION_METHOD.HEAD_TAIL &&
    Number.isFinite(actualClassCount) &&
    actualClassCount >= 2
  ) {
    return Math.min(safeRequested, Math.floor(actualClassCount));
  }

  return safeRequested;
}

export function resolveBreakpointLowerClassCount(
  totalClassCount: number,
  requestedLowerClassCount?: number | null
): number {
  const safeTotalClassCount = Math.max(2, Math.floor(totalClassCount));
  const maxLowerClassCount = safeTotalClassCount - 1;
  const fallbackClassCount = Math.max(1, Math.floor(safeTotalClassCount / 2));

  if (
    typeof requestedLowerClassCount !== 'number' ||
    !Number.isFinite(requestedLowerClassCount)
  ) {
    return fallbackClassCount;
  }

  return Math.min(
    maxLowerClassCount,
    Math.max(1, Math.floor(requestedLowerClassCount))
  );
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
  [CLASSIFICATION_METHOD.KMEANS]: m.discretization_method_kmeans,
  [CLASSIFICATION_METHOD.QUANTILES]: m.discretization_method_quantile,
  [CLASSIFICATION_METHOD.EQUAL_INTERVAL]:
    m.discretization_method_equal_interval,
  [CLASSIFICATION_METHOD.MANUAL]: m.discretization_method_manual,
  [CLASSIFICATION_METHOD.Q6]: m.discretization_method_q6,
  [CLASSIFICATION_METHOD.NESTED_MEANS]: m.discretization_method_nested_means,
  [CLASSIFICATION_METHOD.HEAD_TAIL]: m.discretization_method_head_tail
};

export function resolveDiscretizationLabel(
  classification: ClassificationConfig | undefined
): string {
  const method = normalizeClassificationMethod(classification?.method);
  const numClasses = classification?.numClasses ?? classification?.classes ?? 5;
  const methodLabel = METHOD_LABELS[method]?.() ?? String(method);

  return `${methodLabel}, ${numClasses} ${m.discretization_classes_suffix()}`;
}
