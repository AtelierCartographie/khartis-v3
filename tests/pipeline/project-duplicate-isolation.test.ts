import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SerializedProject } from '$lib/types/serialization.types';

const repository = vi.hoisted(() => ({
  records: new Map<string, SerializedProject>()
}));

vi.mock('$lib/features/project-management', async () => {
  const { persistenceRegistry } =
    await import('$lib/features/project-management/core/persistence-registry');
  const { PROJECT_CONST } =
    await import('$lib/features/project-management/constants');
  const { duplicateProject } =
    await import('$lib/features/project-management/operations/duplicate');

  const readRecord = (id: string) => {
    const record = repository.records.get(id);
    return record ? structuredClone(record) : null;
  };

  return {
    PROJECT_CONST,
    ProjectStorageKey: { CURRENT: 'khartis_current_project' },
    duplicateProject,
    projectRepository: {
      async load(id: string) {
        const record = readRecord(id);
        if (!record) return null;
        persistenceRegistry.resetAll();
        persistenceRegistry.deserializeAll({
          visualization: record.data?.visualizationSettings
        });
        return record;
      },
      async save(project: SerializedProject) {
        const live = persistenceRegistry.serializeAll();
        repository.records.set(project.id, {
          ...structuredClone(project),
          data: {
            ...project.data,
            visualizationSettings: live.visualization
          } as SerializedProject['data']
        });
      },
      loadSerialized: async (id: string) => readRecord(id),
      async saveSerialized(project: SerializedProject) {
        repository.records.set(project.id, structuredClone(project));
      },
      listMetadata: async () =>
        [...repository.records.values()].map((record) => ({
          id: record.id,
          name: record.manifest.name
        }))
    },
    projectStorage: { load: vi.fn(), remove: vi.fn(), save: vi.fn() }
  };
});

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    project_duplicate_suffix: () => '(copie)',
    history_project_not_found: () => 'Projet non trouvé',
    error_duplicate_project_title: () => 'Erreur de duplication'
  }
}));

vi.mock(
  '$lib/features/commons/services/data-orchestrator.service.svelte',
  () => ({ dataOrchestratorService: { onProjectChanged: vi.fn() } })
);
vi.mock('$lib/features/commons/services/analytics.service', () => ({
  analyticsService: {}
}));
vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showError: vi.fn()
}));
vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  LogCategory: { PERSISTENCE: 'PERSISTENCE', PROJECT: 'PROJECT' }
}));
vi.mock('$lib/features/commons/stores/project/project-persistence', () => ({
  saveCurrentProject: vi.fn()
}));
vi.mock('$lib/features/commons/stores/project/project-runtime.svelte', () => ({
  beginProjectRuntime: vi.fn(),
  resetProjectRuntimeState: vi.fn()
}));
vi.mock('$lib/features/commons/stores/project/project-history', () => ({
  addToHistory: vi.fn(),
  resetHistory: vi.fn()
}));

const { persistenceRegistry } =
  await import('$lib/features/project-management/core/persistence-registry');
const { PROJECT_CONST } =
  await import('$lib/features/project-management/constants');
const { duplicateProject } =
  await import('$lib/features/commons/stores/project/project-lifecycle');

interface VisualizationState {
  visualizations: { name: string }[];
}

let liveVisualization: VisualizationState = { visualizations: [] };

function storedProject(id: string, vizName: string): SerializedProject {
  return {
    id,
    manifest: {
      version: PROJECT_CONST.SCHEMA_VERSION,
      name: vizName,
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z'
    },
    data: {
      sourceFiles: [],
      visualizationSettings: { visualizations: [{ name: vizName }] }
    } as unknown as SerializedProject['data']
  };
}

function createContainer(current: SerializedProject) {
  return { _state: { currentProject: current } } as unknown as Parameters<
    typeof duplicateProject
  >[0];
}

describe('duplicating a project that is not the current one', () => {
  beforeEach(() => {
    repository.records.clear();
    persistenceRegistry.register<VisualizationState>({
      key: 'visualization',
      serialize: () => structuredClone(liveVisualization),
      deserialize: (data) => {
        liveVisualization = structuredClone(data);
      },
      reset: () => {
        liveVisualization = { visualizations: [] };
      },
      priority: 'debounced'
    });
  });

  it('leaves the open project live state untouched and copies the stored source', async () => {
    const current = storedProject('current', 'Population');
    const other = storedProject('other', 'Villes');
    repository.records.set(current.id, current);
    repository.records.set(other.id, other);
    liveVisualization = { visualizations: [{ name: 'Population (unsaved)' }] };

    const duplicateId = await duplicateProject(
      createContainer(current),
      other.id,
      'Villes bis'
    );

    expect(liveVisualization.visualizations).toEqual([
      { name: 'Population (unsaved)' }
    ]);
    expect(repository.records.get(current.id)).toEqual(current);
    expect(repository.records.get(other.id)).toEqual(other);

    const duplicate = repository.records.get(duplicateId);
    expect(duplicate?.id).not.toBe(other.id);
    expect(duplicate?.manifest.name).toBe('Villes bis');
    expect(duplicate?.data).toEqual(other.data);
  });
});
