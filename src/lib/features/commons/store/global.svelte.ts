import {
  StylingTools,
  ToolbarState,
  ToolbarStep,
  VisualizationTools,
  type GlobalState,
  type ProjectionFilterId,
  type ProjectionViewMode
} from '$lib/features/commons/types/global';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { datasetsStore } from './datasets.store.svelte';
import { projectStore } from './project.store.svelte';

const SELECTED_TAB_STORAGE_KEY = 'khartis_selected_tab';
const PAGE_ZOOM_STORAGE_KEY = 'khartis_page_zoom_level';

class GlobalStore {
  private _state = $state<GlobalState>({
    settingPanel: false,
    mainPanel: true,
    isSideNavOpen: false,
    isCreateProjectModalOpen: false,
    selectedStep: ToolbarStep.Data,
    selectedTool: undefined,
    toolbarState: ToolbarState.Full,
    projectionFilter: 'all',
    projectionViewMode: 'list',
    zoom: {
      pageZoomLevel:
        typeof window !== 'undefined'
          ? Number(localStorage.getItem(PAGE_ZOOM_STORAGE_KEY)) || 100
          : 100,
      minPageZoom: 10,
      maxPageZoom: 500,
      pageZoomStep: 10
    }
  });

  private _selectedDataButtonId = $state<string | undefined>(
    typeof window !== 'undefined'
      ? localStorage.getItem(SELECTED_TAB_STORAGE_KEY) || undefined
      : undefined
  );

  private _isUpdatingSelection = false;

  private _pendingDatasetSelections = new Set<string>();

  constructor() {
    if (typeof window !== 'undefined' && this._selectedDataButtonId) {
      this.ensureDatasetSelectionForSourceFile(this._selectedDataButtonId);
    }
  }

  private ensureDatasetSelectionForSourceFile(sourceFileId: string): void {
    if (!sourceFileId) return;

    const dataset = datasetsStore.getDatasetBySourceFile(sourceFileId);
    if (dataset) {
      datasetsStore.selectDataset(dataset.id);
      return;
    }

    if (this._pendingDatasetSelections.has(sourceFileId)) {
      return;
    }

    this._pendingDatasetSelections.add(sourceFileId);
    datasetsStore
      .waitForDatasetBySourceFile(sourceFileId)
      .then((datasetId) => {
        if (this._selectedDataButtonId === sourceFileId) {
          datasetsStore.selectDataset(datasetId);
        }
      })
      .catch((error) => {
        logger.error(
          'Failed to wait for dataset selection',
          LogCategory.STORE,
          {
            sourceFileId,
            error: error instanceof Error ? error.message : error
          }
        );
      })
      .finally(() => {
        this._pendingDatasetSelections.delete(sourceFileId);
      });
  }

  /**
   * Ensures there's always a tab selected when files exist.
   * This should be called from a component's $effect.
   * Protected against re-entrancy with a guard flag.
   */
  ensureTabSelected(): void {
    if (this._isUpdatingSelection) {
      return;
    }

    this._isUpdatingSelection = true;
    try {
      const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];

      if (sourceFiles.length > 0) {
        const selectedFileExists = sourceFiles.some(
          (f) => f.id === this._selectedDataButtonId
        );

        if (!this._selectedDataButtonId) {
          const firstFileId = sourceFiles[0].id;
          this.selectDataButton(firstFileId);
        } else if (!selectedFileExists) {
          const isPending = this._pendingDatasetSelections.has(
            this._selectedDataButtonId
          );
          if (!isPending) {
            const firstFileId = sourceFiles[0].id;
            this.selectDataButton(firstFileId);
          }
        }

        if (this._selectedDataButtonId) {
          this.ensureDatasetSelectionForSourceFile(this._selectedDataButtonId);
        }
      } else {
        if (this._selectedDataButtonId) {
          this._selectedDataButtonId = undefined;
          if (typeof window !== 'undefined') {
            localStorage.removeItem(SELECTED_TAB_STORAGE_KEY);
          }
        }
      }
    } finally {
      this._isUpdatingSelection = false;
    }
  }

  dataButtons = $derived.by(() => {
    const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];

    return sourceFiles.map((file) => ({
      id: file.id,
      label: file.name,
      isSelected:
        file.id === this._selectedDataButtonId ||
        (sourceFiles.length === 1 && !this._selectedDataButtonId)
    }));
  });

  get settingPanel() {
    return this._state.settingPanel;
  }

  set settingPanel(value: boolean) {
    this._state.settingPanel = value;
  }

  get mainPanel() {
    return this._state.mainPanel;
  }

  set mainPanel(value: boolean) {
    this._state.mainPanel = value;
  }

  get isSideNavOpen() {
    return this._state.isSideNavOpen;
  }

  set isSideNavOpen(value: boolean) {
    this._state.isSideNavOpen = value;
  }

  get isCreateProjectModalOpen() {
    return this._state.isCreateProjectModalOpen;
  }

  set isCreateProjectModalOpen(value: boolean) {
    this._state.isCreateProjectModalOpen = value;
  }

  get selectedStep() {
    return this._state.selectedStep;
  }

  set selectedStep(value: ToolbarStep) {
    this._state.selectedStep = value;
  }

  get selectedTool() {
    return this._state.selectedTool;
  }

  set selectedTool(value: StylingTools | VisualizationTools | undefined) {
    this._state.selectedTool = value;
  }

  get toolbarState() {
    return this._state.toolbarState;
  }

  set toolbarState(value: ToolbarState) {
    this._state.toolbarState = value;
  }

  get projectionFilter(): ProjectionFilterId | undefined {
    return this._state.projectionFilter;
  }

  set projectionFilter(value: ProjectionFilterId | undefined) {
    this._state.projectionFilter = value;
  }

  get projectionViewMode(): ProjectionViewMode | undefined {
    return this._state.projectionViewMode;
  }

  set projectionViewMode(value: ProjectionViewMode | undefined) {
    this._state.projectionViewMode = value;
  }

  get zoom() {
    return this._state.zoom;
  }

  setNavigationState(selectedStep: ToolbarStep): void {
    this.selectedStep = selectedStep;

    if (selectedStep === ToolbarStep.Styling)
      this.toolbarState = ToolbarState.Collapsed;
    else if (this.toolbarState === ToolbarState.Collapsed)
      this.toolbarState = ToolbarState.Full;
  }

  setToolbarState(state: ToolbarState): void {
    this.toolbarState = state;
  }

  selectDataButton(id: string): void {
    if (this._selectedDataButtonId === id) return;
    this._selectedDataButtonId = id;

    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_TAB_STORAGE_KEY, id);
    }

    this.ensureDatasetSelectionForSourceFile(id);
  }

  setProjectionFilter(id: ProjectionFilterId): void {
    this.projectionFilter = id;
  }

  setProjectionViewMode(mode: ProjectionViewMode): void {
    this.projectionViewMode = mode;
  }

  private adjustPageZoom(direction: 1 | -1): void {
    const currentLevel = this._state.zoom.pageZoomLevel;
    const step = this._state.zoom.pageZoomStep;
    const minZoom = this._state.zoom.minPageZoom;
    const maxZoom = this._state.zoom.maxPageZoom;

    const clamp = direction === 1 ? Math.min : Math.max;
    const limit = direction === 1 ? maxZoom : minZoom;
    const newZoomLevel = clamp(currentLevel + direction * step, limit);

    this._state.zoom.pageZoomLevel = newZoomLevel;
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        PAGE_ZOOM_STORAGE_KEY,
        String(this._state.zoom.pageZoomLevel)
      );
    }
  }

  zoomInPage(): void {
    this.adjustPageZoom(1);
  }

  zoomOutPage(): void {
    this.adjustPageZoom(-1);
  }

  resetPageZoom(): void {
    this._state.zoom.pageZoomLevel = 100;
    if (typeof window !== 'undefined') {
      localStorage.setItem(PAGE_ZOOM_STORAGE_KEY, '100');
    }
  }

  setPageZoom(level: number): void {
    this._state.zoom.pageZoomLevel = Math.max(
      this._state.zoom.minPageZoom,
      Math.min(level, this._state.zoom.maxPageZoom)
    );
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        PAGE_ZOOM_STORAGE_KEY,
        String(this._state.zoom.pageZoomLevel)
      );
    }
  }
}

export const globalState = new GlobalStore();

export const globalActions = {
  setNavigationState: globalState.setNavigationState.bind(globalState),
  setToolbarState: globalState.setToolbarState.bind(globalState),
  selectDataButton: globalState.selectDataButton.bind(globalState),
  ensureTabSelected: globalState.ensureTabSelected.bind(globalState),
  setProjectionFilter: globalState.setProjectionFilter.bind(globalState),
  setProjectionViewMode: globalState.setProjectionViewMode.bind(globalState),
  zoomInPage: globalState.zoomInPage.bind(globalState),
  zoomOutPage: globalState.zoomOutPage.bind(globalState),
  resetPageZoom: globalState.resetPageZoom.bind(globalState),
  setPageZoom: globalState.setPageZoom.bind(globalState)
};
