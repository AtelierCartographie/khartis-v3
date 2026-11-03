import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getLegendState,
  selectRenderedLegendItems
} from '$lib/features/step-toolbar';

type LegendItem = ReturnType<typeof getLegendState>['items'][number];

/** The legends drawn on the map, as the legend editor lists them. */
export function listRenderedLegends(): LegendItem[] {
  return selectRenderedLegendItems(getLegendState().items);
}

/** The visualization the agent knows a legend by: a collection map counts as its base. */
export function resolveLegendVisualizationId(
  legend: LegendItem
): string | undefined {
  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === legend.variableId
  );
  return visualization?.facet?.baseVisualizationId ?? visualization?.id;
}

export function listVisualizationLegends(
  visualizationId: string
): LegendItem[] {
  return listRenderedLegends().filter(
    (legend) => resolveLegendVisualizationId(legend) === visualizationId
  );
}
