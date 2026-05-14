import { ToolbarStep } from '$lib/features/commons/types/global';

export interface MapDisplayDataset {
  id: string;
}

export interface MapDisplayVisualization {
  datasetId: string;
}

export function resolveMapDisplayDatasets<TDataset extends MapDisplayDataset>({
  allDatasets,
  enabledDatasets,
  activeVisualizations,
  selectedStep
}: {
  allDatasets: readonly TDataset[];
  enabledDatasets: readonly TDataset[];
  activeVisualizations: readonly MapDisplayVisualization[];
  selectedStep: ToolbarStep;
}): TDataset[] {
  if (selectedStep === ToolbarStep.Data) {
    return [...enabledDatasets];
  }

  const displayDatasets = [...enabledDatasets];
  const displayDatasetIds = new Set(
    displayDatasets.map((dataset) => dataset.id)
  );
  const activeVisualizationDatasetIds = new Set(
    activeVisualizations.map((visualization) => visualization.datasetId)
  );

  for (const dataset of allDatasets) {
    if (
      activeVisualizationDatasetIds.has(dataset.id) &&
      !displayDatasetIds.has(dataset.id)
    ) {
      displayDatasets.push(dataset);
      displayDatasetIds.add(dataset.id);
    }
  }

  return displayDatasets;
}
