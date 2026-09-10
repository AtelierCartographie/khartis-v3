import type { ClassificationMethod } from '$lib/features/commons/stores/visualization.store.svelte';

export const DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX = 12;

export const NESTED_MEANS_CLASS_COUNTS = [2, 4, 8, 16] as const;

export const Q6_CLASS_COUNT = 6;

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

  if (normalizedMethod === CLASSIFICATION_METHOD.Q6) {
    return Q6_CLASS_COUNT;
  }

  if (normalizedMethod === CLASSIFICATION_METHOD.NESTED_MEANS) {
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

  if (Number.isFinite(actualClassCount) && actualClassCount >= 2) {
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

export const DISCRETIZATION_NOTE = {
  MERGED_BREAKS: 'merged-breaks',
  HEAD_TAIL_LIMIT: 'head-tail-limit',
  EMPTY_CLASSES: 'empty-classes',
  Q6_UNAVAILABLE: 'q6-unavailable'
} as const;

export interface DiscretizationNote {
  kind: (typeof DISCRETIZATION_NOTE)[keyof typeof DISCRETIZATION_NOTE];
  count: number;
}

const HEAD_TAIL_MIN_USEFUL_CLASS_COUNT = 3;

export function isQ6ContractHonoured(
  method: ClassificationMethod,
  actualClassCount: number
): boolean {
  return (
    normalizeClassificationMethod(method) !== CLASSIFICATION_METHOD.Q6 ||
    actualClassCount === Q6_CLASS_COUNT
  );
}

export function resolveDiscretizationNote(input: {
  method: ClassificationMethod;
  requestedClassCount: number;
  actualClassCount: number;
  naturalClassCount?: number | null;
  emptyClassCount?: number;
}): DiscretizationNote | null {
  const method = normalizeClassificationMethod(input.method);

  if (!isQ6ContractHonoured(method, input.actualClassCount)) {
    return {
      kind: DISCRETIZATION_NOTE.Q6_UNAVAILABLE,
      count: input.actualClassCount
    };
  }

  const naturalClassCount =
    typeof input.naturalClassCount === 'number' &&
    Number.isFinite(input.naturalClassCount) &&
    input.naturalClassCount >= 1
      ? Math.floor(input.naturalClassCount)
      : null;

  if (
    method === CLASSIFICATION_METHOD.HEAD_TAIL &&
    naturalClassCount !== null &&
    naturalClassCount < HEAD_TAIL_MIN_USEFUL_CLASS_COUNT
  ) {
    return {
      kind: DISCRETIZATION_NOTE.HEAD_TAIL_LIMIT,
      count: naturalClassCount
    };
  }

  const reachableClassCount =
    naturalClassCount !== null
      ? Math.min(input.requestedClassCount, naturalClassCount)
      : input.requestedClassCount;

  if (input.actualClassCount < reachableClassCount) {
    return {
      kind: DISCRETIZATION_NOTE.MERGED_BREAKS,
      count: input.actualClassCount
    };
  }

  const emptyClassCount = Math.max(0, Math.floor(input.emptyClassCount ?? 0));

  return emptyClassCount > 0
    ? { kind: DISCRETIZATION_NOTE.EMPTY_CLASSES, count: emptyClassCount }
    : null;
}

export function resolveHeadTailClassCountMax(
  naturalClassCount?: number | null
): number {
  if (
    typeof naturalClassCount === 'number' &&
    Number.isFinite(naturalClassCount) &&
    naturalClassCount >= 2
  ) {
    return Math.floor(naturalClassCount);
  }

  return DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
}
