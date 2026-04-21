import {
  applyPaletteInversion,
  calculateBreaks,
  computeDivergingSplit,
  generateColorsForBreaks
} from '$lib/features/commons/services/classification.service';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  normalizeClassificationMethod,
  resolveComputedClassCount,
  resolveRequestedClassCount
} from './components/discretization.utils';
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

export function useComputeBreaks(
  getSelectedViz: () => VisualizationConfig | undefined
) {
  let lastComputedKey = '';
  let computeRequestCounter = 0;

  async function compute(trigger = 'unknown', retryKey = '') {
    const selectedViz = getSelectedViz();
    if (!selectedViz?.datasetId || !selectedViz?.mapping.valueColumn) {
      return;
    }

    const method = selectedViz.classification?.method;
    const numClasses = selectedViz.classification?.numClasses ?? 5;

    if (!method) {
      return;
    }

    const normalizedMethod = normalizeClassificationMethod(method);
    const requestedClassCount = resolveRequestedClassCount(
      normalizedMethod,
      numClasses
    );
    const computeKey = `${selectedViz.id}-${selectedViz.mapping.valueColumn}-${normalizedMethod}-${requestedClassCount}-${retryKey}`;
    if (computeKey === lastComputedKey) {
      return;
    }
    lastComputedKey = computeKey;
    computeRequestCounter += 1;
    const requestId = computeRequestCounter;

    const dataset = datasetsStore.datasets.find(
      (d) => d.id === selectedViz.datasetId
    );
    if (!dataset?.sourceFileId) {
      logger.warn(
        '[configure-visualization] skipped breaks computation (missing sourceFileId)',
        LogCategory.UI,
        {
          trigger,
          requestId,
          datasetId: selectedViz.datasetId
        }
      );
      return;
    }

    try {
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: selectedViz.mapping.valueColumn,
        method: normalizedMethod,
        numClasses: requestedClassCount
      });

      if (requestId !== computeRequestCounter) return;

      const currentViz = getSelectedViz();
      if (result && currentViz?.id) {
        const actualNumClasses = resolveComputedClassCount(
          normalizedMethod,
          requestedClassCount,
          result.counts.length
        );
        const existingColors = currentViz.classification?.colors;
        const contrast = isColorBlindnessActive(getColorBlindnessState())
          ? ('high' as const)
          : undefined;
        let colors: string[];
        if (existingColors && existingColors.length === actualNumClasses) {
          colors = existingColors;
        } else {
          const paletteType =
            currentViz.classification?.breakpointValue != null
              ? 'diverging'
              : 'sequential';
          const userPalette = currentViz.classification?.paletteId
            ? findPaletteById(currentViz.classification.paletteId)
            : undefined;
          const isPatternPalette = userPalette?.type === PALETTE_TYPE.PATTERN;
          const divergingSplit =
            paletteType === 'diverging'
              ? computeDivergingSplit(
                  actualNumClasses,
                  result.breaks,
                  currentViz.classification?.breakpointValue ?? null
                )
              : undefined;
          colors =
            userPalette && !isPatternPalette
              ? generatePaletteColors(
                  userPalette,
                  actualNumClasses,
                  contrast,
                  undefined,
                  divergingSplit
                )
              : generateColorsForBreaks(
                  actualNumClasses,
                  paletteType,
                  contrast,
                  divergingSplit
                );
          colors = applyPaletteInversion(
            colors,
            currentViz.classification?.inverted ?? false
          );
        }
        const classificationUpdate: Parameters<
          typeof visualizationStore.updateClassification
        >[1] = {
          breaks: result.breaks,
          counts: result.counts,
          colors
        };
        if (
          normalizedMethod !== method ||
          actualNumClasses !== numClasses ||
          currentViz.classification?.classes !== actualNumClasses
        ) {
          classificationUpdate.method = normalizedMethod;
          classificationUpdate.classes = actualNumClasses;
          classificationUpdate.numClasses = actualNumClasses;
        }
        visualizationStore.updateClassification(
          currentViz.id,
          classificationUpdate
        );
      } else {
        logger.warn(
          '[configure-visualization] breaks computation returned empty result, will retry',
          LogCategory.UI,
          {
            requestId,
            selectedVisualizationId: currentViz?.id
          }
        );
      }
    } catch (error) {
      logger.error(
        '[configure-visualization] breaks computation crashed',
        LogCategory.UI,
        {
          requestId,
          trigger,
          error
        }
      );
    }
  }

  return { compute };
}
