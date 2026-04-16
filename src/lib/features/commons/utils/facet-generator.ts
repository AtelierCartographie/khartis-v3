import type { VisualizationConfig } from '../store/visualization.store.svelte';
import { datasetsStore } from '../store/datasets.store.svelte';
import { deepClone } from './clone.utils';
import { LogCategory, logger } from './logger';
import {
  SCALE_MODE,
  type ScaleMode
} from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';

function buildEqualIntervalBreaks(
  min: number,
  max: number,
  classes: number
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min, max];
  }

  const totalClasses = Math.max(2, classes);
  const step = (max - min) / totalClasses;
  const breaks = [min];

  for (let i = 1; i < totalClasses; i += 1) {
    breaks.push(min + step * i);
  }

  breaks.push(max);
  return breaks;
}

function buildFacetClassification(
  baseViz: VisualizationConfig,
  variable: string,
  scaleMode: ScaleMode
): VisualizationConfig['classification'] {
  const baseClassification = baseViz.classification;
  if (!baseClassification) {
    return baseClassification;
  }

  if (scaleMode === SCALE_MODE.SHARED) {
    return { ...baseClassification };
  }

  const stats = datasetsStore.getColumnStatistics(baseViz.datasetId, variable);
  if (
    !stats ||
    !('min' in stats) ||
    !('max' in stats) ||
    typeof stats.min !== 'number' ||
    typeof stats.max !== 'number'
  ) {
    return { ...baseClassification };
  }

  const classes =
    baseClassification.numClasses ?? baseClassification.classes ?? 5;
  const independentBreaks = buildEqualIntervalBreaks(
    stats.min,
    stats.max,
    classes
  );

  return {
    ...baseClassification,
    numClasses: classes,
    classes,
    breaks: independentBreaks
  };
}

export async function generateFacetVisualizations(
  baseViz: VisualizationConfig,
  variables: string[],
  scaleMode: ScaleMode
): Promise<VisualizationConfig[]> {
  logger.debug('Generating facet visualizations', LogCategory.STORE, {
    baseVizId: baseViz.id,
    variablesCount: variables.length,
    scaleMode
  });

  const tableName = baseViz.datasetId;

  if (!tableName) {
    throw new Error('Base visualization has no dataset');
  }

  const facetConfigs: VisualizationConfig[] = [];

  for (const variable of variables) {
    const facetId = crypto.randomUUID();

    const cloned = deepClone(baseViz);

    const facetConfig: VisualizationConfig = {
      ...cloned,
      id: facetId,
      name: variable,
      facet: {
        baseVisualizationId: baseViz.id
      },
      mapping: {
        ...cloned.mapping,
        valueColumn: variable
      },
      classification: buildFacetClassification(baseViz, variable, scaleMode)
    };

    facetConfigs.push(facetConfig);
  }

  logger.debug('Facet visualizations generated', LogCategory.STORE, {
    count: facetConfigs.length
  });

  return facetConfigs;
}
