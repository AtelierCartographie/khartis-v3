import type {
  ClassificationConfig,
  ClassificationMethod
} from '$lib/features/commons/store/visualization.store.svelte';
import { ClassificationMethod as CM } from '$lib/features/commons/store/visualization.store.svelte';
import * as m from '$lib/paraglide/messages.js';

export const DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX = 12;

/** Power-of-two class counts allowed by the recursive nested-means algorithm. */
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

/**
 * Returns the class count that the algorithm will actually honour for a given
 * method, given a user request. q6 is fixed at 6, nested_means snaps to {2,4,8,16},
 * other methods clamp to a minimum of 2.
 */
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

/**
 * After computation some methods (head_tail, standard_deviation) produce fewer
 * classes than requested because the data distribution does not allow it.
 * Returns the effective class count so the UI can clamp the slider.
 */
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

const METHOD_LABELS: Record<ClassificationMethod, () => string> = {
  [CM.JENKS]: m.discretization_method_jenks,
  [CM.QUANTILES]: m.discretization_method_quantile,
  [CM.EQUAL_INTERVAL]: m.discretization_method_equal_interval,
  [CM.STANDARD_DEVIATION]: m.discretization_method_stddev,
  [CM.MANUAL]: m.discretization_method_manual,
  [CM.Q6]: m.discretization_method_q6,
  [CM.NESTED_MEANS]: m.discretization_method_nested_means,
  [CM.HEAD_TAIL]: m.discretization_method_head_tail
};

export function resolveDiscretizationLabel(
  classification: ClassificationConfig | undefined
): string {
  if (!classification) {
    return `${m.discretization_method_jenks()}, 5 ${m.discretization_num_classes().toLowerCase()}`;
  }

  const method = classification.method ?? CM.JENKS;
  const numClasses = classification.numClasses ?? classification.classes ?? 5;
  const methodLabel = METHOD_LABELS[method]?.() ?? String(method);

  return `${methodLabel}, ${numClasses} ${m.discretization_num_classes().toLowerCase()}`;
}
