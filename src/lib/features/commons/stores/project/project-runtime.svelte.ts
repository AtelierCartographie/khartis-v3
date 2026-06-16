import { persistenceRegistry } from '$lib/features/project-management';
import { dataTabStore } from '$lib/features/data-tab/stores/data-tab.store.svelte';
import { dataToolsStore } from '$lib/features/data-tab/stores/data-tools.store.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { projectionStore } from '$lib/features/map/stores/projection.store.svelte';
import { globalActions } from '../global.svelte';
import { datasetsStore } from '../datasets.store.svelte';

export interface ProjectRuntimeSnapshot {
  generation: number;
  projectId: string | null;
}

export interface ResetProjectRuntimeStateOptions {
  resetPersistence?: boolean;
}

const runtime = $state<ProjectRuntimeSnapshot>({
  generation: 0,
  projectId: null
});

export const projectRuntime = {
  get generation(): number {
    return runtime.generation;
  },
  get projectId(): string | null {
    return runtime.projectId;
  },
  get runtimeKey(): string {
    return `${runtime.generation}:${runtime.projectId ?? 'empty'}`;
  }
};

export function beginProjectRuntime(
  projectId: string | null
): ProjectRuntimeSnapshot {
  runtime.generation += 1;
  runtime.projectId = projectId;
  return captureProjectRuntime();
}

export function captureProjectRuntime(): ProjectRuntimeSnapshot {
  return {
    generation: runtime.generation,
    projectId: runtime.projectId
  };
}

export function isCurrentProjectRuntime(
  snapshot: ProjectRuntimeSnapshot
): boolean {
  return (
    snapshot.generation === runtime.generation &&
    snapshot.projectId === runtime.projectId
  );
}

export function resetProjectRuntimeState(
  options: ResetProjectRuntimeStateOptions = {}
): void {
  if (options.resetPersistence ?? true) {
    persistenceRegistry.resetAll();
  }
  datasetsStore.clear();
  basemapService.reset();
  projectionStore.reset();
  globalActions.resetNavigationState();
  dataTabStore.reset();
  dataToolsStore.reset();
}
