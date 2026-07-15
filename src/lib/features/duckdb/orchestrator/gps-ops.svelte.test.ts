import { describe, expect, it, vi } from 'vitest';
import type { Table } from 'apache-arrow/Arrow';
import { markTableMutated } from '../cache/cache-manager';
import { FileType, type DuckDBContext, type DuckDBDataset } from '../types';
import { getGPSArrowTable, type DuckDBClientForGPS } from './gps-ops';

function makeGpsDataset(
  tableName: string,
  lat = 'latitude',
  lon = 'longitude'
): DuckDBDataset {
  return {
    id: `${tableName}-id`,
    tableName,
    sourceFileId: 'source-1',
    name: `${tableName}.csv`,
    columns: [],
    rowCount: 3,
    metadata: {
      processedAt: new Date('2026-07-15T00:00:00Z'),
      fileType: FileType.CSV
    },
    gpsMode: true,
    gpsColumns: { lat, lon }
  };
}

function makeDuckStub(): DuckDBClientForGPS {
  return { query: vi.fn().mockResolvedValue([]) };
}

function makeArrowLoader() {
  return vi.fn(async () => ({}) as unknown as Table);
}

function makeMutationContext(): DuckDBContext {
  return {
    describeCache: new Map(),
    rowCountCache: new Map()
  } as unknown as DuckDBContext;
}

describe('getGPSArrowTable cache', () => {
  it('should reuse the cached arrow table when the same table and gps columns are requested again', async () => {
    const dataset = makeGpsDataset('sites_seveso_reuse');
    const loadArrowTable = makeArrowLoader();

    const first = await getGPSArrowTable(
      dataset,
      makeDuckStub(),
      loadArrowTable
    );
    const second = await getGPSArrowTable(
      dataset,
      makeDuckStub(),
      loadArrowTable
    );

    expect(loadArrowTable).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('should rebuild the arrow table when the source table is mutated', async () => {
    const dataset = makeGpsDataset('sites_seveso_mutation');
    const loadArrowTable = makeArrowLoader();

    await getGPSArrowTable(dataset, makeDuckStub(), loadArrowTable);
    markTableMutated(makeMutationContext(), dataset.tableName);
    await getGPSArrowTable(dataset, makeDuckStub(), loadArrowTable);

    expect(loadArrowTable).toHaveBeenCalledTimes(2);
  });

  it('should build separate cache entries when the gps columns differ on the same table', async () => {
    const loadArrowTable = makeArrowLoader();

    await getGPSArrowTable(
      makeGpsDataset('sites_seveso_columns', 'lat_a', 'lon_a'),
      makeDuckStub(),
      loadArrowTable
    );
    await getGPSArrowTable(
      makeGpsDataset('sites_seveso_columns', 'lat_b', 'lon_b'),
      makeDuckStub(),
      loadArrowTable
    );

    expect(loadArrowTable).toHaveBeenCalledTimes(2);
  });
});
