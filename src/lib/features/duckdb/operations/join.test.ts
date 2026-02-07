import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '../types';

const { executeQueryMock } = vi.hoisted(() => ({
  executeQueryMock: vi.fn()
}));

vi.mock('../core/query', () => ({
  executeQuery: executeQueryMock
}));

import { applyJoinAssociation } from './join';

function createContextWithJoinMetadata(): DuckDBContext {
  return {
    db: {} as DuckDBContext['db'],
    connection: {} as DuckDBContext['connection'],
    loaded_files: new Map(),
    registered_files: new Set(),
    table_metadata: new Map([
      [
        'dataset_table',
        {
          analysis: null,
          join: {
            id: 'country',
            join_results_name: 'dataset_table_join_results',
            basemap_join_ref: null
          },
          filters: new Map()
        }
      ]
    ]),
    table_geoparquet_cache: new Map(),
    queryCache: new Map(),
    describeCache: new Map(),
    rowCountCache: new Map(),
    cacheState: {
      size: 0,
      accessOrder: []
    },
    extensionsLoaded: {
      spatial: true,
      httpfs: true
    },
    extensionLoadPromises: {
      spatial: null,
      httpfs: null
    },
    localExtensionRepositoryConfigured: true,
    threadsSupported: true,
    bundleVariant: 'eh'
  };
}

describe('applyJoinAssociation SQL generation', () => {
  beforeEach(() => {
    executeQueryMock.mockReset();
  });

  it('keeps unmatched rows by filtering basemap in JOIN CTE, not in WHERE clause', async () => {
    executeQueryMock
      .mockResolvedValueOnce([{ column_name: 'basemap_id' }])
      .mockResolvedValueOnce(undefined);

    const ctx = createContextWithJoinMetadata();
    await applyJoinAssociation(ctx, 'dataset_table', 'test-basemap');

    expect(executeQueryMock).toHaveBeenCalledTimes(2);
    const appliedQuery = String(executeQueryMock.mock.calls[1][1]);

    expect(appliedQuery).toContain('WITH ranked_join AS');
    expect(appliedQuery).toContain("WHERE basemap = 'test-basemap'");
    expect(appliedQuery).toContain('LEFT JOIN ranked_join as j');
    expect(appliedQuery).toContain('PARTITION BY geoname');
    expect(appliedQuery).not.toContain("WHERE j.basemap = 'test-basemap'");
  });
});
