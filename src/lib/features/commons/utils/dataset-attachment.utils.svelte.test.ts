import { describe, expect, it } from 'vitest';
import {
  detachTablesFrom,
  findAttachedDataset,
  listVisualizableDatasets
} from './dataset-attachment.utils';

const geo = { id: 'geo', name: 'communes', sourceFileId: 'geo-file' };
const table = { id: 'table', name: 'population', sourceFileId: 'table-file' };
const other = { id: 'other', name: 'votes', sourceFileId: 'other-file' };
const sourceFiles = [
  { id: 'geo-file' },
  {
    id: 'table-file',
    attachedTo: { sourceFileId: 'geo-file', datasetName: 'communes' }
  },
  { id: 'other-file' }
];

describe('listVisualizableDatasets', () => {
  it('should leave out a table attached to a geo file of the project', () => {
    const datasets = listVisualizableDatasets(
      [geo, table, other],
      sourceFiles,
      () => false
    );

    expect(datasets.map((dataset) => dataset.id)).toEqual(['geo', 'other']);
  });

  it('should keep an attached table that already has visualizations', () => {
    const datasets = listVisualizableDatasets(
      [geo, table],
      sourceFiles,
      (datasetId) => datasetId === 'table'
    );

    expect(datasets.map((dataset) => dataset.id)).toEqual(['geo', 'table']);
  });

  it('should keep an attached table whose geo file is gone', () => {
    const datasets = listVisualizableDatasets(
      [table],
      sourceFiles,
      () => false
    );

    expect(datasets.map((dataset) => dataset.id)).toEqual(['table']);
  });
});

describe('findAttachedDataset', () => {
  it('should fall back to the file when the layer was renamed', () => {
    const renamed = { ...geo, name: 'communes 2024' };

    expect(
      findAttachedDataset([renamed, table], {
        sourceFileId: 'geo-file',
        datasetName: 'communes'
      })
    ).toBe(renamed);
  });
});

describe('detachTablesFrom', () => {
  it('should detach only the tables joined into the reset geo file', () => {
    const files = detachTablesFrom(
      [
        ...sourceFiles,
        {
          id: 'elsewhere',
          attachedTo: { sourceFileId: 'other-file', datasetName: 'votes' }
        }
      ],
      'geo-file'
    );

    expect(files.map((file) => file.attachedTo?.sourceFileId)).toEqual([
      undefined,
      undefined,
      undefined,
      'other-file'
    ]);
  });
});
