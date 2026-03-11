import type { ClassificationMethod } from '$lib/features/commons/store/visualization.store.svelte';

export const DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX = 12;
export const NESTED_MEANS_CLASS_COUNTS = [2, 4, 8, 16] as const;

export function normalizeClassificationMethod(
  method: ClassificationMethod
): ClassificationMethod {
  return (
    method === 'standard_deviation' ? 'nested_means' : method
  ) as ClassificationMethod;
}

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
    normalizedMethod === 'head_tail' &&
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
