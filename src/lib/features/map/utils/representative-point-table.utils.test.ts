import { describe, expect, it, vi } from 'vitest';
import { resolveRepresentativePointTableName } from './representative-point-table.utils';

describe('resolveRepresentativePointTableName', () => {
  it('keeps the dataset table when rendering is not split on a joined basemap', async () => {
    const loadBasemapGeometryTableName =
      vi.fn<(basemapId: string) => Promise<string>>();

    await expect(
      resolveRepresentativePointTableName({
        datasetTableName: 'dataset_table',
        joinedBasemapId: null,
        loadBasemapGeometryTableName
      })
    ).resolves.toBe('dataset_table');

    expect(loadBasemapGeometryTableName).not.toHaveBeenCalled();
  });

  it('switches to the basemap geometry table for split joined-basemap rendering', async () => {
    const loadBasemapGeometryTableName =
      vi.fn<(basemapId: string) => Promise<string>>();
    loadBasemapGeometryTableName.mockResolvedValue('basemap_geom_world');

    await expect(
      resolveRepresentativePointTableName({
        datasetTableName: 'dataset_table',
        joinedBasemapId: 'world',
        loadBasemapGeometryTableName
      })
    ).resolves.toBe('basemap_geom_world');

    expect(loadBasemapGeometryTableName).toHaveBeenCalledWith('world');
  });
});
