import { tableFromArrays } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';
import {
  getGPSArrowTable,
  validateGPSColumns,
  type DuckDBClientForGPS
} from '$lib/features/duckdb/orchestrator/gps-ops';
import { FileType, type DuckDBDataset } from '$lib/features/duckdb/types';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';

function mockDuck(result: Record<string, number>): DuckDBClientForGPS {
  return {
    async query() {
      return [result];
    }
  };
}

describe('[D-06] validateGPSColumns — magnitude-based swap detection (CSV-11)', () => {
  it('flags swap when lat cluster is small and lon cluster is around 48-49 (IDF shape)', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 1.55,
        lat_max: 3.17,
        lat_median: 2.5,
        lon_min: 48.18,
        lon_max: 49.21,
        lon_median: 48.9
      })
    );
    expect(result.possibleInversion).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it('does NOT flag swap for normal IDF GPS (lat ~48-49, lon ~2-3)', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 48.18,
        lat_max: 49.21,
        lat_median: 48.9,
        lon_min: 1.55,
        lon_max: 3.17,
        lon_median: 2.5
      })
    );
    expect(result.possibleInversion).toBe(false);
    expect(result.isValid).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

describe('[D-07] validateGPSColumns — out-of-range warnings (CSV-12)', () => {
  it('warns when latitude max exceeds 90', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 48,
        lat_max: 95.12,
        lat_median: 70,
        lon_min: 2,
        lon_max: 3,
        lon_median: 2.5
      })
    );
    // lat_max > 90 AND lonInRange -> latLooksLikeLon + lonLooksLikeLat -> inversion path
    expect(result.isValid).toBe(false);
    expect(result.warning).toBeTruthy();
  });

  it('warns when longitude max exceeds 180', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 48,
        lat_max: 49,
        lat_median: 48.5,
        lon_min: 2,
        lon_max: 200.42,
        lon_median: 100
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.warning).toBeTruthy();
  });

  it('warns when latitude values are strictly negative out of range', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: -91,
        lat_max: -80,
        lat_median: -85,
        lon_min: 2,
        lon_max: 3,
        lon_median: 2.5
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.warning).toBeTruthy();
  });
});

describe('[D-06][D-07] validateGPSColumns — clean GPS data (CSV-04, CSV-06, CSV-09)', () => {
  it('returns isValid without warning for realistic world GPS', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'lon',
      mockDuck({
        lat_min: -33.87,
        lat_max: 64.8,
        lat_median: 12,
        lon_min: -122.4,
        lon_max: 151.2,
        lon_median: 14
      })
    );
    expect(result.isValid).toBe(true);
    expect(result.possibleInversion).toBe(false);
    expect(result.warning).toBeUndefined();
  });
});

describe('[D-07] validateGPSColumns — no parseable coordinates (CSV-12)', () => {
  it('reports invalid with null stats and a warning when no lat/lon pair parses', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({ lat_min: null as unknown as number })
    );
    expect(result.isValid).toBe(false);
    expect(result.possibleInversion).toBe(false);
    expect(result.latStats).toBeNull();
    expect(result.lonStats).toBeNull();
    expect(result.warning).toBeTruthy();
  });
});

describe('[D-08] getGPSArrowTable — transient GPS materialization', () => {
  it('throws a DataValidationError when the dataset is not in GPS mode', async () => {
    const dataset: DuckDBDataset = {
      id: 'dataset-without-gps',
      tableName: 'sites',
      sourceFileId: 'source-1',
      name: 'sites.csv',
      columns: [],
      rowCount: 1,
      metadata: {
        processedAt: new Date('2026-04-18T00:00:00.000Z'),
        fileType: FileType.CSV
      }
    };

    const request = getGPSArrowTable(dataset, mockDuck({}), vi.fn());

    await expect(request).rejects.toMatchObject({
      name: 'DataValidationError',
      code: 'DATA_VALIDATION_ERROR',
      field: 'gpsMode',
      details: {
        datasetId: 'dataset-without-gps',
        field: 'gpsMode'
      }
    });
    await expect(request).rejects.toBeInstanceOf(DataValidationError);
  });

  it('materializes GPS rows in a temp table and drops it after Arrow export', async () => {
    const queries: string[] = [];
    const duck: DuckDBClientForGPS = {
      async query(sql: string) {
        queries.push(sql);
        return [];
      }
    };
    const arrowTable = tableFromArrays({ id: [1] });
    const getArrowTableDirect = vi.fn(async (_tableName: string) => arrowTable);
    const dataset: DuckDBDataset = {
      id: 'dataset-1',
      tableName: 'sites_seveso_idf_custom_gps_columns',
      sourceFileId: 'source-1',
      name: 'sites-seveso-idf-custom-gps-columns.csv',
      columns: [],
      rowCount: 5,
      metadata: {
        processedAt: new Date('2026-04-18T00:00:00.000Z'),
        fileType: FileType.CSV
      },
      gpsMode: true,
      gpsColumns: {
        lat: 'latitude_wgs84',
        lon: 'longitude_wgs84'
      }
    };

    const result = await getGPSArrowTable(dataset, duck, getArrowTableDirect);
    const gpsTableName = getArrowTableDirect.mock.calls[0]?.[0];

    expect(result.table.numRows).toBe(1);
    expect(result.latColumn).toBe('latitude_wgs84');
    expect(result.lonColumn).toBe('longitude_wgs84');
    expect(gpsTableName).toMatch(
      /^gps_sites_seveso_idf_custom_gps_columns_dataset_1_[a-z0-9]+$/
    );
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain(`CREATE TEMP TABLE "${gpsTableName}" AS`);
    expect(queries[1]).toContain(`DROP TABLE IF EXISTS "${gpsTableName}"`);
  });

  it('deduplicates concurrent Arrow materialization for the same GPS dataset', async () => {
    const queries: string[] = [];
    const gate: { release: (() => void) | null } = { release: null };
    const createTableGate = new Promise<void>((resolve) => {
      gate.release = () => resolve();
    });

    const duck: DuckDBClientForGPS = {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes('CREATE TEMP TABLE')) {
          await createTableGate;
        }
        return [];
      }
    };
    const arrowTable = tableFromArrays({ id: [1, 2] });
    const getArrowTableDirect = vi.fn(async (_tableName: string) => arrowTable);
    const dataset: DuckDBDataset = {
      id: 'dataset-2',
      tableName: 'sites_seveso_idf',
      sourceFileId: 'source-2',
      name: 'sites-seveso-idf.csv',
      columns: [],
      rowCount: 96,
      metadata: {
        processedAt: new Date('2026-04-18T00:00:00.000Z'),
        fileType: FileType.CSV
      },
      gpsMode: true,
      gpsColumns: {
        lat: 'lat',
        lon: 'long'
      }
    };

    const firstLoad = getGPSArrowTable(dataset, duck, getArrowTableDirect);
    const secondLoad = getGPSArrowTable(dataset, duck, getArrowTableDirect);

    await Promise.resolve();
    await Promise.resolve();
    gate.release?.();

    const [firstResult, secondResult] = await Promise.all([
      firstLoad,
      secondLoad
    ]);

    expect(firstResult.table.numRows).toBe(2);
    expect(secondResult.table.numRows).toBe(2);
    expect(firstResult.latColumn).toBe('lat');
    expect(secondResult.lonColumn).toBe('long');
    expect(getArrowTableDirect).toHaveBeenCalledTimes(1);
    expect(
      queries.filter((sql) => sql.includes('CREATE TEMP TABLE'))
    ).toHaveLength(1);
    expect(
      queries.filter((sql) => sql.includes('DROP TABLE IF EXISTS'))
    ).toHaveLength(1);
  });
});
