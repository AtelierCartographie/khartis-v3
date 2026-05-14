import { describe, expect, it } from 'vitest';
import { ToolbarStep } from '$lib/features/commons/types/global';
import {
  resolveMapDisplayDatasets,
  type MapDisplayDataset,
  type MapDisplayVisualization
} from './map-display-datasets.utils';

function dataset(id: string): MapDisplayDataset {
  return { id };
}

function visualization(datasetId: string): MapDisplayVisualization {
  return { datasetId };
}

describe('resolveMapDisplayDatasets', () => {
  const csvDataset = dataset('csv-dataset');
  const lineDataset = dataset('line-dataset');
  const unusedDataset = dataset('unused-dataset');
  const allDatasets = [csvDataset, lineDataset, unusedDataset];

  it('keeps the data step scoped to enabled datasets only', () => {
    expect(
      resolveMapDisplayDatasets({
        allDatasets,
        enabledDatasets: [csvDataset],
        activeVisualizations: [visualization(lineDataset.id)],
        selectedStep: ToolbarStep.Data
      })
    ).toEqual([csvDataset]);
  });

  it('adds datasets required by active visualizations outside the data step', () => {
    expect(
      resolveMapDisplayDatasets({
        allDatasets,
        enabledDatasets: [csvDataset],
        activeVisualizations: [visualization(lineDataset.id)],
        selectedStep: ToolbarStep.Visualizations
      })
    ).toEqual([csvDataset, lineDataset]);
  });

  it('does not keep inactive disabled datasets in styling', () => {
    expect(
      resolveMapDisplayDatasets({
        allDatasets,
        enabledDatasets: [csvDataset],
        activeVisualizations: [],
        selectedStep: ToolbarStep.Styling
      })
    ).toEqual([csvDataset]);
  });

  it('does not duplicate an enabled dataset with an active visualization', () => {
    expect(
      resolveMapDisplayDatasets({
        allDatasets,
        enabledDatasets: [csvDataset, lineDataset],
        activeVisualizations: [visualization(lineDataset.id)],
        selectedStep: ToolbarStep.Visualizations
      })
    ).toEqual([csvDataset, lineDataset]);
  });
});
