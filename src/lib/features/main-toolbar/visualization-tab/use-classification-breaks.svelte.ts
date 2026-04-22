import {
  applyPaletteInversion,
  calculateBreakCounts,
  calculateBreaks,
  computeDivergingSplit,
  generateColorsForBreaks
} from '$lib/features/commons/services/classification.service';
import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { ClassificationMethod } from '$lib/features/commons/store/visualization.store.svelte';
import {
  findPaletteById,
  generatePaletteColors,
  PALETTE_TYPE
} from '$lib/features/commons/components/palette-popover/palette.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  getColorBlindnessState,
  isColorBlindnessActive
} from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
import {
  normalizeClassificationMethod,
  resolveComputedClassCount,
  resolveRequestedClassCount
} from './components/discretization.utils';

type BreaksResult = Awaited<ReturnType<typeof calculateBreaks>>;

export interface ClassificationBreaksComputation {
  normalizedMethod: ClassificationMethod;
  requestedClassCount: number;
  actualClassCount: number;
  result: NonNullable<BreaksResult>;
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
  trigger?: string;
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
  if (existingColors && existingColors.length === actualClassCount) {
    return existingColors;
  }

  const contrast = getContrastMode();
  const paletteType = breakpointValue != null ? 'diverging' : 'sequential';
  const userPalette = classification?.paletteId
    ? findPaletteById(classification.paletteId)
    : undefined;
  const isPatternPalette = userPalette?.type === PALETTE_TYPE.PATTERN;
  const divergingSplit =
    paletteType === 'diverging'
      ? computeDivergingSplit(actualClassCount, breakValues, breakpointValue)
      : undefined;

  const colors =
    userPalette && !isPatternPalette
      ? generatePaletteColors(
          userPalette,
          actualClassCount,
          contrast,
          undefined,
          divergingSplit
        )
      : generateColorsForBreaks(
          actualClassCount,
          paletteType,
          contrast,
          divergingSplit
        );

  return applyPaletteInversion(colors, classification?.inverted ?? false);
}

export async function computeClassificationBreaks(
  options: ComputeClassificationBreaksOptions
): Promise<ClassificationBreaksComputation | null> {
  const classification = options.classification;
  const storeMethod = normalizeClassificationMethod(
    options.method ?? classification?.method ?? ClassificationMethod.JENKS
  );
  const requestedClassCount = resolveRequestedClassCount(
    storeMethod,
    options.numClasses ??
      classification?.numClasses ??
      classification?.classes ??
      5
  );

  let result: BreaksResult = null;

  if (storeMethod === ClassificationMethod.MANUAL) {
    const breakValues = options.breakValues ?? classification?.breaks ?? [];
    const expectedThresholdCount = Math.max(requestedClassCount - 1, 0);

    if (breakValues.length === expectedThresholdCount) {
      result = await calculateBreakCounts({
        datasetId: options.datasetSourceFileId,
        columnName: options.valueColumn,
        breaks: breakValues
      });
    } else {
      result = await calculateBreaks({
        datasetId: options.datasetSourceFileId,
        columnName: options.valueColumn,
        method: ClassificationMethod.EQUAL_INTERVAL,
        numClasses: requestedClassCount
      });
    }
  } else {
    result = await calculateBreaks({
      datasetId: options.datasetSourceFileId,
      columnName: options.valueColumn,
      method: storeMethod,
      numClasses: requestedClassCount
    });
  }

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
    options.breakpointValue ?? classification?.breakpointValue
  );

  return {
    normalizedMethod: storeMethod,
    requestedClassCount,
    actualClassCount,
    result,
    colors
  };
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
