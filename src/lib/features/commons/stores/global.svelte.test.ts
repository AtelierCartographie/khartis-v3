import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  notifyChangeMock: vi.fn(),
  datasetsStoreMock: {
    datasets: [] as Array<{ id: string; sourceFileId: string }>,
    selectedDataset: undefined as
      | { id: string; sourceFileId: string }
      | undefined,
    getDatasetBySourceFile: vi.fn(),
    waitForDatasetBySourceFile: vi.fn(),
    selectDataset: vi.fn(),
    enableDataset: vi.fn(),
    disableDataset: vi.fn()
  },
  projectStoreMock: {
    currentProject: undefined as
      | { data?: { sourceFiles?: Array<{ id: string; name: string }> } }
      | undefined
  }
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('./datasets.store.svelte', () => ({
  datasetsStore: mocks.datasetsStoreMock
}));

vi.mock('./project.store.svelte', () => ({
  projectStore: mocks.projectStoreMock
}));

import {
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

  it('serializes only project-owned UI state', () => {
    globalState.isSideNavOpen = true;
    globalState.isCreateProjectModalOpen = true;
    globalState.selectedStep = ToolbarStep.Styling;
    globalState.selectedTool = VisualizationTools.Search;
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
});
