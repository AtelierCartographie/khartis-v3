import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  basemapReset: vi.fn(),
  dataTabReset: vi.fn(),
  dataToolsReset: vi.fn(),
  datasetsClear: vi.fn(),
  navigationReset: vi.fn(),
  persistenceResetAll: vi.fn(),
  projectionReset: vi.fn()
}));

vi.mock('$lib/features/project-management/core', () => ({
  persistenceRegistry: {
    resetAll: mocks.persistenceResetAll
  }
}));

vi.mock('$lib/features/data-tab/stores/data-tab.store.svelte', () => ({
  dataTabStore: {
    reset: mocks.dataTabReset
  }
}));

vi.mock('$lib/features/data-tab/stores/data-tools.store.svelte', () => ({
  dataToolsStore: {
    reset: mocks.dataToolsReset
  }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    reset: mocks.basemapReset
  }
}));

vi.mock('$lib/features/map/stores/projection.store.svelte', () => ({
  projectionStore: {
    reset: mocks.projectionReset
  }
}));

vi.mock('../global.svelte', () => ({
  globalActions: {
    resetNavigationState: mocks.navigationReset
  }
}));

vi.mock('../datasets.store.svelte', () => ({
  datasetsStore: {
    clear: mocks.datasetsClear
  }
}));

describe('project runtime reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve deserialized project stores when persistence reset is disabled', async () => {
    const { resetProjectRuntimeState } =
      await import('./project-runtime.svelte');

    resetProjectRuntimeState({ resetPersistence: false });

    expect(mocks.persistenceResetAll).not.toHaveBeenCalled();
    expect(mocks.navigationReset).not.toHaveBeenCalled();
    expect(mocks.dataTabReset).not.toHaveBeenCalled();
    expect(mocks.dataToolsReset).not.toHaveBeenCalled();
    expect(mocks.datasetsClear).toHaveBeenCalledOnce();
    expect(mocks.basemapReset).toHaveBeenCalledOnce();
    expect(mocks.projectionReset).toHaveBeenCalledOnce();
  });

  it('should clear project stores for a fresh runtime reset', async () => {
    const { resetProjectRuntimeState } =
      await import('./project-runtime.svelte');

    resetProjectRuntimeState();

    expect(mocks.persistenceResetAll).toHaveBeenCalledOnce();
    expect(mocks.navigationReset).toHaveBeenCalledOnce();
    expect(mocks.dataTabReset).toHaveBeenCalledOnce();
    expect(mocks.dataToolsReset).toHaveBeenCalledOnce();
    expect(mocks.datasetsClear).toHaveBeenCalledOnce();
    expect(mocks.basemapReset).toHaveBeenCalledOnce();
    expect(mocks.projectionReset).toHaveBeenCalledOnce();
  });
});
