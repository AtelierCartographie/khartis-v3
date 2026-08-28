import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  notifyChangeMock: vi.fn(),
  datasetsStoreMock: {
    datasets: [] as Array<{ id: string; sourceFileId: string }>,
    selectedDataset: undefined as
      { id: string; sourceFileId: string } | undefined,
    getDatasetBySourceFile: vi.fn(),
    waitForDatasetBySourceFile: vi.fn(),
    selectDataset: vi.fn(),
    enableDataset: vi.fn(),
    disableDataset: vi.fn(),
    syncMapVisibilityWithSourceFile: vi.fn()
  },
  dataTabResetMock: vi.fn(),
  projectStoreMock: {
    currentProject: undefined as
      | { data?: { sourceFiles?: Array<{ id: string; name: string }> } }
      | undefined
  }
}));

vi.mock('$lib/features/project-management/core', () => ({
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('./datasets.store.svelte', () => ({
  datasetsStore: mocks.datasetsStoreMock
}));

vi.mock('./data-tab.store.svelte', () => ({
  dataTabActions: {
    reset: mocks.dataTabResetMock
  }
}));

vi.mock('./project.store.svelte', () => ({
  projectStore: mocks.projectStoreMock
}));

import {
  StylingTools,
  ToolbarState,
  ToolbarStep,
  VisualizationTools
} from '$lib/features/commons/types/global';
import { globalActions, globalState } from './global.svelte';

const globalUiEntry = mocks.registerMock.mock.calls.find(
  ([entry]) => entry?.key === 'globalUi'
)?.[0] as
  | {
      serialize: () => Record<string, unknown>;
      deserialize: (data: unknown) => void;
    }
  | undefined;

describe('globalState project persistence boundary', () => {
  beforeEach(() => {
    mocks.notifyChangeMock.mockClear();
    mocks.dataTabResetMock.mockClear();
    mocks.datasetsStoreMock.getDatasetBySourceFile.mockReset();
    mocks.datasetsStoreMock.waitForDatasetBySourceFile.mockReset();
    mocks.datasetsStoreMock.selectDataset.mockReset();
    mocks.datasetsStoreMock.syncMapVisibilityWithSourceFile.mockReset();
    mocks.datasetsStoreMock.datasets = [];
    mocks.datasetsStoreMock.selectedDataset = undefined;
    mocks.projectStoreMock.currentProject = undefined;

    globalActions.resetNavigationState();
    globalState.isSideNavOpen = false;
    globalState.isCreateProjectModalOpen = false;
    globalState.isDuplicateModalOpen = false;
    globalState.isDeleteModalOpen = false;
  });

  it('restores project-owned navigation state without altering local-only chrome', () => {
    globalState.isSideNavOpen = true;
    globalState.isCreateProjectModalOpen = true;

    globalUiEntry?.deserialize({
      selectedStep: ToolbarStep.Visualizations,
      selectedTool: VisualizationTools.Layers,
      toolbarState: ToolbarState.Compact,
      selectedSourceFileId: 'source-2',
      pageZoomLevel: 180,
      pagePanOffset: { x: 12, y: -8 }
    });

    expect(globalState.selectedStep).toBe(ToolbarStep.Visualizations);
    expect(globalState.selectedTool).toBe(VisualizationTools.Layers);
    expect(globalState.toolbarState).toBe(ToolbarState.Compact);
    expect(globalState.selectedDataButtonId).toBe('source-2');
    expect(globalState.zoom.pageZoomLevel).toBe(180);
    expect(globalState.zoom.pagePanOffset).toEqual({ x: 12, y: -8 });
    expect(globalState.isSideNavOpen).toBe(true);
    expect(globalState.isCreateProjectModalOpen).toBe(true);
  });

  it('falls back to safe navigation defaults for invalid persisted values', () => {
    globalUiEntry?.deserialize({
      selectedStep: 'invalid-step',
      selectedTool: 'invalid-tool',
      toolbarState: 'floating',
      projectionFilter: 'Mercator',
      projectionViewMode: 'tiles',
      selectedSourceFileId: 42,
      pageZoomLevel: Number.NaN,
      pagePanOffset: { x: 'left', y: 15 }
    });

    expect(globalState.selectedStep).toBe(ToolbarStep.Data);
    expect(globalState.selectedTool).toBeUndefined();
    expect(globalState.toolbarState).toBe(ToolbarState.Full);
    expect(globalState.projectionFilter).toBe('all');
    expect(globalState.projectionViewMode).toBe('list');
    expect(globalState.selectedDataButtonId).toBeUndefined();
    expect(globalState.zoom.pageZoomLevel).toBe(100);
    expect(globalState.zoom.pagePanOffset).toEqual({ x: 0, y: 15 });
  });

  it('keeps valid persisted navigation enum values', () => {
    globalUiEntry?.deserialize({
      selectedStep: ToolbarStep.Styling,
      selectedTool: StylingTools.Legend,
      toolbarState: ToolbarState.Collapsed,
      projectionFilter: 'Arrondie',
      projectionViewMode: 'grid'
    });

    expect(globalState.selectedStep).toBe(ToolbarStep.Styling);
    expect(globalState.selectedTool).toBe(StylingTools.Legend);
    expect(globalState.toolbarState).toBe(ToolbarState.Collapsed);
    expect(globalState.projectionFilter).toBe('Arrondie');
    expect(globalState.projectionViewMode).toBe('grid');
  });

  it('serializes only project-owned UI state', () => {
    globalState.isSideNavOpen = true;
    globalState.isCreateProjectModalOpen = true;
    globalState.selectedStep = ToolbarStep.Styling;
    globalActions.setSelectedTool(VisualizationTools.Search);
    globalActions.setMapExporting(true);
    globalActions.setPageZoom(140);
    globalActions.setPagePanOffset({ x: 5, y: 7 });

    const serialized = globalUiEntry?.serialize() as Record<string, unknown>;

    expect(serialized).toMatchObject({
      selectedStep: ToolbarStep.Styling,
      selectedTool: VisualizationTools.Search,
      pageZoomLevel: 140,
      pagePanOffset: { x: 5, y: 7 }
    });
    expect(serialized).not.toHaveProperty('isSideNavOpen');
    expect(serialized).not.toHaveProperty('isCreateProjectModalOpen');
    expect(serialized).not.toHaveProperty('isMapExporting');
  });

  it('keeps map export mode transient and resettable', () => {
    globalActions.setNavigationState(ToolbarStep.Visualizations);
    globalActions.setMapExporting(true);

    expect(globalState.selectedStep).toBe(ToolbarStep.Visualizations);
    expect(globalState.isMapExporting).toBe(true);

    globalActions.resetNavigationState();

    expect(globalState.selectedStep).toBe(ToolbarStep.Data);
    expect(globalState.isMapExporting).toBe(false);
  });

  it('resets persisted data tab with notification when a user selects another source file', () => {
    mocks.datasetsStoreMock.selectedDataset = {
      id: 'dataset-1',
      sourceFileId: 'source-1'
    };
    mocks.datasetsStoreMock.getDatasetBySourceFile.mockReturnValue({
      id: 'dataset-2',
      sourceFileId: 'source-2'
    });

    globalActions.selectDataButton('source-2', {
      notifyDataTabReset: true
    });

    expect(mocks.datasetsStoreMock.selectDataset).toHaveBeenCalledWith(
      'dataset-2'
    );
    expect(mocks.dataTabResetMock).toHaveBeenCalledWith({ notify: true });
    expect(
      mocks.datasetsStoreMock.syncMapVisibilityWithSourceFile
    ).toHaveBeenCalledWith('source-2');
  });

  it('should recover selection when the dataset appears after a stale wait', async () => {
    let rejectWait: (reason?: unknown) => void = () => {};
    const pendingWait = new Promise<string>((_, reject) => {
      rejectWait = reject;
    });

    mocks.datasetsStoreMock.getDatasetBySourceFile
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ id: 'dataset-1', sourceFileId: 'source-1' });
    mocks.datasetsStoreMock.waitForDatasetBySourceFile.mockReturnValue(
      pendingWait
    );

    globalActions.selectDataButton('source-1');
    rejectWait(new Error('stale dataset wait'));

    await vi.waitFor(() => {
      expect(mocks.datasetsStoreMock.selectDataset).toHaveBeenCalledWith(
        'dataset-1'
      );
    });
  });
});
