import type { VisualizationConfig } from '../store/visualization.store.svelte';
import { LogCategory, logger } from './logger';
import type { ScaleMode } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';

export async function generateFacetVisualizations(
  baseViz: VisualizationConfig,
  variables: string[],
  scaleMode: ScaleMode
): Promise<VisualizationConfig[]> {
  logger.info('Generating facet visualizations', LogCategory.STORE, {
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

    const facetConfig: VisualizationConfig = {
      ...baseViz,
      id: facetId,
      name: variable,
      mapping: {
        ...baseViz.mapping,
        valueColumn: variable
      }
    };

    facetConfigs.push(facetConfig);
  }

  logger.success('Facet visualizations generated', LogCategory.STORE, {
    count: facetConfigs.length
  });

  return facetConfigs;
}
