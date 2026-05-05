import {
  applyPaletteInversion,
  calculateBreakCounts,
  calculateDivergingBreaks,
  calculateBreaks,
  computeDivergingSplit,
  generateColorsForBreaks
} from '$lib/features/commons/services/classification.service';
import type {
  ClassificationConfig,
  PrimitiveFilter
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  ClassificationMethod,
  DEFAULT_CATEGORICAL_COLORS
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  DEFAULT_QUALITATIVE_PRESET,
  findPaletteById,
  generateCategoricalColorsFromSeed,
  generatePaletteColors,
  PALETTE_TYPE
} from '$lib/features/commons/components/palette-popover/palette.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  getColorBlindnessState,
  isColorBlindnessActive
} from '$lib/features/step-toolbar/tools/color-blindness';
import {
  normalizeClassificationMethod,
  resolveBreakpointLowerClassCount,
  resolveComputedClassCount,
  resolveRequestedClassCount
} from '../components/discretization/discretization.utils';

type BreaksResult = Awaited<ReturnType<typeof calculateBreaks>>;

export const CLASSIFICATION_BREAKS_TRIGGER = {
  UNKNOWN: 'unknown',
  MISSING_BREAKS: 'missing-breaks',
  CLASSIFICATION_PARAMS_CHANGED: 'classification-params-changed'
} as const;

export type ClassificationBreakTrigger =
  (typeof CLASSIFICATION_BREAKS_TRIGGER)[keyof typeof CLASSIFICATION_BREAKS_TRIGGER];

export const TEXT_BACKGROUND_SCOPE_TARGET = 'text-background' as const;
export const SYMBOL_FILL_SCOPE_TARGET = 'symbol-fill' as const;

export function buildClassificationScopeKey(
  role: 'fill' | 'stroke' | 'size',
  target:
    | PrimitiveFilter
    | typeof TEXT_BACKGROUND_SCOPE_TARGET
    | typeof SYMBOL_FILL_SCOPE_TARGET
): string {
  return `${role}:${target}`;
}

interface ClassificationColorParamsTarget {
  classification: ClassificationConfig | undefined;
  usesCategories: boolean;
}

export function buildClassificationColorParamsKey(
  key: string,
  target: ClassificationColorParamsTarget | null | undefined
): string {
  if (!target) {
    return `${key}:none`;
  }

  const numColors = target.usesCategories
    ? Math.max(target.classification?.labels?.length ?? 0, 0)
    : (target.classification?.classes ?? 0);
  const breakpointValue = target.classification?.breakpointValue;
  const paletteType =
    breakpointValue != null ? PALETTE_TYPE.DIVERGING : PALETTE_TYPE.SEQUENTIAL;
  const breakpointKey =
    paletteType === PALETTE_TYPE.DIVERGING && Number.isFinite(breakpointValue)
      ? String(breakpointValue)
      : '';
  const breaksKey =
    paletteType === PALETTE_TYPE.DIVERGING
      ? (target.classification?.breaks ?? []).join(',')
      : '';

  return [
    key,
    target.classification?.paletteId ?? '',
    String(target.classification?.inverted ?? false),
    String(numColors),
    paletteType,
    breakpointKey,
    breaksKey,
    String(target.usesCategories)
  ].join(':');
}

export interface ClassificationBreaksComputation {
  normalizedMethod: ClassificationMethod;
  requestedClassCount: number;
  actualClassCount: number;
  result: NonNullable<BreaksResult>;
  breakpointLowerClassCount?: number;
  colors: string[];
}

interface ComputeClassificationBreaksOptions {
  datasetSourceFileId: string;
  valueColumn: string;
  classification?: ClassificationConfig;
  method?: ClassificationMethod;
  numClasses?: number;
  breakValues?: number[];
  breakpointValue?: number | null;
  breakpointLowerClassCount?: number | null;
}

interface BreaksRetryState {
  attempts: number;
  handle: ReturnType<typeof setTimeout>;
  key: string;
}

interface ClassificationBreaksControllerOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  resolveDatasetSourceFileId: (datasetId: string) => string | undefined;
}

interface ComputeClassificationBreaksTargetOptions {
  scopeKey: string;
  datasetId?: string;
  valueColumn?: string;
  classification?: ClassificationConfig;
  trigger?: ClassificationBreakTrigger;
  applyUpdate: (updates: Partial<ClassificationConfig>) => void;
}

function getContrastMode() {
  return isColorBlindnessActive(getColorBlindnessState())
    ? ('high' as const)
    : undefined;
}

export function resolveClassificationBreakColors(
  classification: ClassificationConfig | undefined,
  actualClassCount: number,
  breakValues: readonly number[],
  breakpointValue: number | null | undefined
): string[] {
  const existingColors = classification?.colors;
  const hasSameBreakpoint =
    (classification?.breakpointValue ?? null) === (breakpointValue ?? null);
  const existingBreaks = classification?.breaks ?? [];
  const hasSameBreaks =
    existingBreaks.length === breakValues.length &&
    existingBreaks.every(
      (breakValue, index) => breakValue === breakValues[index]
    );
  const canReuseExistingColors =
    existingColors &&
    existingColors.length === actualClassCount &&
    hasSameBreakpoint &&
    (breakpointValue == null || hasSameBreaks);

  if (canReuseExistingColors) {
    return existingColors;
  }

  const colors = resolveClassificationColors({
    classification,
    usesCategories: false,
    classCount: actualClassCount,
    breakValues,
    breakpointValue,
    ignorePatternPalette: true
  });

  return colors ?? [];
}

export function areClassificationColorsEqual(
  existing: readonly string[] | undefined,
  next: readonly string[] | undefined
): boolean {
  if (!existing || !next) {
    return false;
  }

  return (
    existing.length === next.length &&
    existing.every((color, index) => color === next[index])
  );
}

interface ResolveClassificationColorsOptions {
  classification: ClassificationConfig | undefined;
  usesCategories: boolean;
  classCount?: number;
  breakValues?: readonly number[];
  breakpointValue?: number | null;
  ignorePatternPalette?: boolean;
}

export function resolveClassificationColors({
  classification,
  usesCategories,
  classCount,
  breakValues,
  breakpointValue,
  ignorePatternPalette = false
}: ResolveClassificationColorsOptions): string[] | null {
  if (!classification) {
    return null;
  }

  const contrast = getContrastMode();
  const userPalette = classification?.paletteId
    ? findPaletteById(classification.paletteId)
    : undefined;
  let colors: string[];

  if (usesCategories) {
    const resolvedColorCount = Math.max(
      classCount ??
        classification.labels?.length ??
        DEFAULT_CATEGORICAL_COLORS.length,
      1
    );

    if (
      userPalette &&
      (!ignorePatternPalette || userPalette.type !== PALETTE_TYPE.PATTERN)
    ) {
      colors = generatePaletteColors(userPalette, resolvedColorCount, contrast);
    } else if (classification.colors?.length === resolvedColorCount) {
      colors = classification.colors;
    } else if (resolvedColorCount <= DEFAULT_CATEGORICAL_COLORS.length) {
      colors = DEFAULT_CATEGORICAL_COLORS.slice(0, resolvedColorCount);
    } else {
      colors = generateCategoricalColorsFromSeed(
        DEFAULT_CATEGORICAL_COLORS[0],
        resolvedColorCount,
        DEFAULT_QUALITATIVE_PRESET
      );
    }
  } else {
    const resolvedClassCount =
      classCount ?? classification.classes ?? classification.numClasses ?? 0;
    if (!resolvedClassCount) {
      return null;
    }

    const resolvedBreakpointValue =
      breakpointValue ?? classification.breakpointValue;
    const paletteType =
      resolvedBreakpointValue != null
        ? PALETTE_TYPE.DIVERGING
        : PALETTE_TYPE.SEQUENTIAL;
    const divergingSplit =
      paletteType === PALETTE_TYPE.DIVERGING
        ? computeDivergingSplit(
            resolvedClassCount,
            breakValues ?? classification.breaks ?? [],
            resolvedBreakpointValue
          )
        : undefined;

    if (
      userPalette &&
      (!ignorePatternPalette || userPalette.type !== PALETTE_TYPE.PATTERN)
    ) {
      colors = generatePaletteColors(
        userPalette,
        resolvedClassCount,
        contrast,
        undefined,
        divergingSplit
      );
    } else {
      colors = generateColorsForBreaks(
        resolvedClassCount,
        paletteType,
        contrast,
        divergingSplit
      );
    }
  }

  return applyPaletteInversion(colors, classification?.inverted ?? false);
}

export async function computeClassificationBreaks(
  options: ComputeClassificationBreaksOptions
): Promise<ClassificationBreaksComputation | null> {
  const classification = options.classification;
  const storeMethod = normalizeClassificationMethod(
    options.method ?? classification?.method ?? ClassificationMethod.KMEANS
  );
  const requestedClassCount = resolveRequestedClassCount(
    storeMethod,
    options.numClasses ??
      classification?.numClasses ??
      classification?.classes ??
      5
  );
  const breakpointValue = Object.prototype.hasOwnProperty.call(
    options,
    'breakpointValue'
  )
    ? options.breakpointValue
    : classification?.breakpointValue;
  const breakpointLowerClassCount = resolveBreakpointLowerClassCount(
    requestedClassCount,
    options.breakpointLowerClassCount ??
      classification?.breakpointLowerClassCount
  );
  const breakpointUpperClassCount =
    requestedClassCount - breakpointLowerClassCount;

  const result: BreaksResult =
    storeMethod === ClassificationMethod.MANUAL
      ? await computeManualBreaks({
          datasetSourceFileId: options.datasetSourceFileId,
          valueColumn: options.valueColumn,
          requestedClassCount,
          breakValues: options.breakValues ?? classification?.breaks ?? []
        })
      : breakpointValue != null &&
          Number.isFinite(breakpointValue) &&
          breakpointUpperClassCount > 0
        ? await calculateDivergingBreaks({
            datasetId: options.datasetSourceFileId,
            columnName: options.valueColumn,
            method: storeMethod,
            breakpointValue,
            lowerClassCount: breakpointLowerClassCount,
            upperClassCount: breakpointUpperClassCount
          })
        : await calculateBreaks({
            datasetId: options.datasetSourceFileId,
            columnName: options.valueColumn,
            method: storeMethod,
            numClasses: requestedClassCount
          });

  if (!result) {
    return null;
  }

  const actualClassCount = resolveComputedClassCount(
    storeMethod,
    requestedClassCount,
    result.counts.length
  );
  const colors = resolveClassificationBreakColors(
    classification,
    actualClassCount,
    result.breaks,
    breakpointValue
  );

  return {
    normalizedMethod: storeMethod,
    requestedClassCount,
    actualClassCount,
    result,
    breakpointLowerClassCount: result.breakpointLowerClassCount,
    colors
  };
}

async function computeManualBreaks({
  datasetSourceFileId,
  valueColumn,
  requestedClassCount,
  breakValues
}: {
  datasetSourceFileId: string;
  valueColumn: string;
  requestedClassCount: number;
  breakValues: number[];
}): Promise<BreaksResult> {
  const expectedThresholdCount = Math.max(requestedClassCount - 1, 0);

  if (breakValues.length === expectedThresholdCount) {
    return await calculateBreakCounts({
      datasetId: datasetSourceFileId,
      columnName: valueColumn,
      breaks: breakValues
    });
  }

  return await calculateBreaks({
    datasetId: datasetSourceFileId,
    columnName: valueColumn,
    method: ClassificationMethod.EQUAL_INTERVAL,
    numClasses: requestedClassCount
  });
}

export function useClassificationBreaksController({
  maxRetries = 3,
  retryDelayMs = 200,
  resolveDatasetSourceFileId
}: ClassificationBreaksControllerOptions) {
  const inFlightKeys = new Map<string, string>();
  const lastCompletedKeys = new Map<string, string>();
  const pendingRetries = new Map<string, BreaksRetryState>();
  const requestCounters = new Map<string, number>();

  function clearRetry(scopeKey: string): void {
    const pending = pendingRetries.get(scopeKey);
    if (!pending) {
      return;
    }

    clearTimeout(pending.handle);
    pendingRetries.delete(scopeKey);
  }

  function clearAllRetries(): void {
    for (const pending of pendingRetries.values()) {
      clearTimeout(pending.handle);
    }
    pendingRetries.clear();
  }

  function scheduleRetry(
    options: ComputeClassificationBreaksTargetOptions & {
      breaksKey: string;
    }
  ): boolean {
    const existing = pendingRetries.get(options.scopeKey);
    if (existing) {
      clearTimeout(existing.handle);
    }

    const priorAttempts =
      existing && existing.key === options.breaksKey ? existing.attempts : 0;
    if (priorAttempts >= maxRetries) {
      pendingRetries.delete(options.scopeKey);
      return false;
    }

    const handle = setTimeout(() => {
      const latestKey = inFlightKeys.get(options.scopeKey);
      if (latestKey && latestKey !== options.breaksKey) {
        return;
      }

      if (
        !options.classification?.method ||
        options.classification.method === ClassificationMethod.MANUAL ||
        !options.valueColumn
      ) {
        pendingRetries.delete(options.scopeKey);
        return;
      }

      if (options.classification.breaks?.length) {
        pendingRetries.delete(options.scopeKey);
        return;
      }

      void compute(options);
    }, retryDelayMs);

    pendingRetries.set(options.scopeKey, {
      attempts: priorAttempts + 1,
      handle,
      key: options.breaksKey
    });
    return true;
  }

  async function compute(
    options: ComputeClassificationBreaksTargetOptions
  ): Promise<void> {
    if (!options.datasetId || !options.valueColumn) {
      clearRetry(options.scopeKey);
      return;
    }

    const classification = options.classification;
    const method = classification?.method;
    if (!method || method === ClassificationMethod.MANUAL) {
      clearRetry(options.scopeKey);
      return;
    }

    const normalizedMethod = normalizeClassificationMethod(method);
    const requestedClassCount = resolveRequestedClassCount(
      normalizedMethod,
      classification?.numClasses ?? 5
    );
    const breaksKey = `${options.scopeKey}:${options.datasetId}:${options.valueColumn}:${normalizedMethod}:${requestedClassCount}`;
    const hasExistingBreaks = Boolean(classification?.breaks?.length);

    if (inFlightKeys.get(options.scopeKey) === breaksKey) {
      return;
    }

    if (
      hasExistingBreaks &&
      lastCompletedKeys.get(options.scopeKey) === breaksKey
    ) {
      clearRetry(options.scopeKey);
      return;
    }

    const datasetSourceFileId = resolveDatasetSourceFileId(options.datasetId);
    if (!datasetSourceFileId) {
      logger.warn(
        '[use-classification-breaks] skipped breaks computation (missing sourceFileId)',
        LogCategory.UI,
        {
          datasetId: options.datasetId,
          scopeKey: options.scopeKey,
          trigger: options.trigger
        }
      );
      clearRetry(options.scopeKey);
      return;
    }

    inFlightKeys.set(options.scopeKey, breaksKey);
    const requestId = (requestCounters.get(options.scopeKey) ?? 0) + 1;
    requestCounters.set(options.scopeKey, requestId);

    try {
      const computation = await computeClassificationBreaks({
        datasetSourceFileId,
        valueColumn: options.valueColumn,
        classification,
        method,
        numClasses: classification?.numClasses
      });

      if (requestCounters.get(options.scopeKey) !== requestId) {
        return;
      }

      if (!computation) {
        const scheduled = scheduleRetry({
          ...options,
          breaksKey
        });
        if (!scheduled) {
          logger.error(
            '[use-classification-breaks] breaks computation failed after retry cap',
            LogCategory.UI,
            {
              datasetId: options.datasetId,
              method: normalizedMethod,
              scopeKey: options.scopeKey,
              trigger: options.trigger,
              valueColumn: options.valueColumn
            }
          );
        }
        return;
      }

      const classificationUpdate: Partial<ClassificationConfig> = {
        breaks: computation.result.breaks,
        counts: computation.result.counts,
        colors: computation.colors
      };

      if (computation.breakpointLowerClassCount != null) {
        classificationUpdate.breakpointLowerClassCount =
          computation.breakpointLowerClassCount;
      }

      if (
        computation.normalizedMethod !== method ||
        computation.actualClassCount !== (classification?.numClasses ?? 5) ||
        classification?.classes !== computation.actualClassCount
      ) {
        classificationUpdate.method = computation.normalizedMethod;
        classificationUpdate.classes = computation.actualClassCount;
        classificationUpdate.numClasses = computation.actualClassCount;
      }

      options.applyUpdate(classificationUpdate);
      lastCompletedKeys.set(options.scopeKey, breaksKey);
      clearRetry(options.scopeKey);
    } catch (error) {
      logger.error(
        '[use-classification-breaks] breaks computation crashed',
        LogCategory.UI,
        {
          datasetId: options.datasetId,
          error,
          scopeKey: options.scopeKey,
          trigger: options.trigger,
          valueColumn: options.valueColumn
        }
      );
    } finally {
      if (inFlightKeys.get(options.scopeKey) === breaksKey) {
        inFlightKeys.delete(options.scopeKey);
      }
    }
  }

  return {
    clearRetry,
    compute,
    destroy: clearAllRetries
  };
}
