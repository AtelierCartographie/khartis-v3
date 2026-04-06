import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import {
  DataSourceType,
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import type { ProjectStateContainer } from '$lib/features/commons/store/project/project-state.svelte';

const mocks = vi.hoisted(() => ({
  loadMock: vi.fn(),
  loadSerializedMock: vi.fn(),
  saveMock: vi.fn(),
  saveStorageMock: vi.fn(),
  notifyChangeMock: vi.fn()
}));

vi.mock('$lib/features/project-management', () => ({
  ProjectStorageKey: {
    CURRENT: 'current'
  },
  projectFiles: {
    createArchive: vi.fn(),
    importProject: vi.fn()
  },
  projectRepository: {
    load: mocks.loadMock,
    loadSerialized: mocks.loadSerializedMock,
    save: mocks.saveMock
  },
  projectStorage: {
    save: mocks.saveStorageMock
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDataset: vi.fn(() => null)
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: null
}));

vi.mock('$lib/features/map/services', () => ({
  basemapCatalogService: {
    basemaps: []
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    error_save_project_title: () => 'Erreur sauvegarde',
    error_export_project_title: () => 'Erreur export',
    error_import_project_title: () => 'Erreur import'
  }
}));

vi.mock(
  '$lib/features/commons/services/data-orchestrator.service.svelte',
  () => ({
    dataOrchestratorService: {
      onProjectChanged: vi.fn()
    }
  })
);

vi.mock('$lib/features/commons/store/data-tab.store.svelte', () => ({
  dataTabState: {
    basemapJoin: {
      selectedBasemap: undefined
    },
    geolocation: {
      latitudeColumn: undefined,
      longitudeColumn: undefined,
      linkedVariableName: undefined
    }
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    datasets: [],
    selectedDataset: undefined
  }
}));

vi.mock('$lib/features/commons/utils/file-export.utils', () => ({
  downloadFile: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    PROJECT: 'PROJECT'
  },
  logger: {
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showError: vi.fn()
}));

vi.mock('$lib/features/commons/utils/persisted-join-state.utils', () => ({
  resolvePersistedJoinState: vi.fn(() => ({}))
}));

vi.mock('$lib/features/commons/utils/string.utils', () => ({
  generateProjectFilename: vi.fn(() => 'project.kh')
}));

vi.mock('$lib/features/commons/utils/validation.utils', () => ({
  ProjectValidator: {
    validateProjectSize: vi.fn(() => ({
      isValid: true,
      errors: [],
      warnings: []
    }))
  }
}));

vi.mock('$lib/features/commons/store/project/project-history', () => ({
  addToHistory: vi.fn(),
  resetHistory: vi.fn()
}));

import { saveCurrentProject } from '$lib/features/commons/store/project/project-persistence';

function createUploadedFile(
  overrides: Partial<UploadedFile> = {}
): UploadedFile {
  return {
    id: 'source-file-id',
    name: 'nuts2_data.geojson',
    size: 1024,
    type: 'application/geo+json',
    fileType: FileType.GEOJSON,
    status: FileStatus.COMPLETE,
    sourceType: DataSourceType.URL,
    ...overrides
  };
}

describe('project persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadMock.mockResolvedValue(null);
    mocks.loadSerializedMock.mockResolvedValue(null);
    mocks.saveMock.mockResolvedValue(undefined);
  });

  it('merges persisted source file payloads without deserializing the project again', async () => {
    const currentFile = createUploadedFile({
      content: undefined,
      statistics: {},
      parsedData: []
    });

    mocks.loadSerializedMock.mockResolvedValue({
      id: 'project-id',
      manifest: {
        version: '3.0.0',
        createdAt: '2026-04-06T00:00:00.000Z',
        updatedAt: '2026-04-06T00:00:00.000Z',
        name: 'Projet test'
      },
      data: {
        sourceFiles: [
          {
            id: currentFile.id,
            name: currentFile.name,
            size: currentFile.size,
            type: currentFile.type,
            fileType: currentFile.fileType,
            status: currentFile.status,
            sourceType: currentFile.sourceType,
            content: '{"type":"FeatureCollection"}',
            contentType: 'string',
            statistics: { rowCount: 244 },
            parsedData: [{ NAME_LATN: 'Zurich' }]
          }
        ]
      }
    });

    const container = {
      _state: {
        currentProject: {
          id: 'project-id',
          manifest: {
            version: '3.0.0',
            createdAt: new Date('2026-04-06T00:00:00.000Z'),
            updatedAt: new Date('2026-04-06T00:00:00.000Z'),
            name: 'Projet test',
            format: 'kh'
          },
          data: {
            sourceFiles: [currentFile]
          }
        },
        isDirty: true,
        lastSaved: undefined,
        autoSaveEnabled: true,
        autoSaveInterval: 30000,
        history: [],
        historyIndex: -1,
        maxHistorySize: 50,
        isInitialized: true,
        isLoading: false
      },
      autoSave: {
        updateConfig: vi.fn(),
        schedule: vi.fn(),
        cancel: vi.fn()
      }
    } satisfies ProjectStateContainer;

    await saveCurrentProject(container);

    expect(mocks.loadSerializedMock).toHaveBeenCalledWith('project-id');
    expect(mocks.loadMock).not.toHaveBeenCalled();
    expect(
      container._state.currentProject?.data?.sourceFiles?.[0]?.content
    ).toBe('{"type":"FeatureCollection"}');
    expect(
      container._state.currentProject?.data?.sourceFiles?.[0]?.statistics
    ).toEqual({ rowCount: 244 });
    expect(
      container._state.currentProject?.data?.sourceFiles?.[0]?.parsedData
    ).toEqual([{ NAME_LATN: 'Zurich' }]);
    expect(mocks.saveMock).toHaveBeenCalledTimes(1);
    expect(container._state.isDirty).toBe(false);
    expect(container._state.lastSaved).toBeInstanceOf(Date);
  });
});
