import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';

type MockSourceFile = Partial<UploadedFile> & Pick<UploadedFile, 'id' | 'name'>;

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  saveCurrentProjectMock: vi.fn(),
  currentProject: {
    data: {
      sourceFiles: [
        {
          id: 'source-1',
          name: 'countries.csv'
        }
      ] as MockSourceFile[]
    }
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: (sql: string, options?: { format?: string }) =>
      mocks.queryMock(sql, options)
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    },
    saveCurrentProject: () => mocks.saveCurrentProjectMock()
  }
}));

import { persistTabularSourceSnapshot } from '$lib/features/main-toolbar/data-tab/services/tabular-source-snapshot';

describe('persistTabularSourceSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentProject = {
      data: {
        sourceFiles: [
          {
            id: 'source-1',
            name: 'countries.csv'
          }
        ]
      }
    };
    mocks.queryMock.mockResolvedValue([
      {
        country: 'France',
        basemap_id: 'FR',
        typo_match: 'exact'
      }
    ]);
  });

  it('persists normalized tabular rows, statistics and join metadata', async () => {
    await persistTabularSourceSnapshot({
      sourceFileId: 'source-1',
      tableName: 'joined_table',
      duckColumns: [
        {
          name: 'country',
          type_simple: 'string',
          count: 1,
          nulls: 0,
          uniques: 1
        },
        {
          name: 'basemap_id',
          type_simple: 'string',
          count: 1,
          nulls: 0,
          uniques: 1
        },
        {
          name: 'typo_match',
          type_simple: 'string',
          count: 1,
          nulls: 0,
          uniques: 1
        }
      ],
      joinState: {
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'country',
        gpsMode: false,
        gpsColumns: undefined
      }
    });

    const sourceFile = mocks.currentProject.data.sourceFiles[0];

    expect(sourceFile.duckdbTableName).toBe('joined_table');
    expect(sourceFile.joinedBasemap).toBe('monde-countries-2024-medium');
    expect(sourceFile.geoColumn).toBe('country');
    expect(sourceFile.parsedData).toEqual([
      {
        country: 'France',
        basemap_id: 'FR',
        typo_match: 'exact'
      }
    ]);
    expect(sourceFile.statistics).toEqual({
      country: {
        type: 'string',
        count: 1,
        nullCount: 0,
        unique: 1,
        min: undefined,
        max: undefined,
        mean: undefined
      },
      basemap_id: {
        type: 'string',
        count: 1,
        nullCount: 0,
        unique: 1,
        min: undefined,
        max: undefined,
        mean: undefined
      },
      typo_match: {
        type: 'string',
        count: 1,
        nullCount: 0,
        unique: 1,
        min: undefined,
        max: undefined,
        mean: undefined
      }
    });
    expect(mocks.saveCurrentProjectMock).toHaveBeenCalledTimes(1);
  });
});
