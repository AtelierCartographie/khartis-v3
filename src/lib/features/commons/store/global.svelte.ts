import {
  ToolbarState,
  ToolbarStep,
  ZoomMode,
  StylingTools,
  VisualizationTools,
  type GlobalState,
  type ProjectionFilterId,
  type ProjectionViewMode
} from '$lib/features/commons/types/global';
import { datasetsStore } from './datasets.store.svelte';
import { projectStore } from './project.store.svelte';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

const SELECTED_TAB_STORAGE_KEY = 'khartis_selected_tab';
const MAP_ZOOM_STORAGE_KEY = 'khartis_map_zoom_level';
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
      mode: ZoomMode.Map,
      mapZoomLevel: typeof window !== 'undefined'
        ? Number(localStorage.getItem(MAP_ZOOM_STORAGE_KEY)) || 100
        : 100,
      pageZoomLevel: typeof window !== 'undefined'
        ? Number(localStorage.getItem(PAGE_ZOOM_STORAGE_KEY)) || 100
        : 100,
      minMapZoom: 10,
      maxMapZoom: 1000,
      minPageZoom: 10,
      maxPageZoom: 500,
      zoomStep: 10,
      pageZoomStep: 10
    }
  });

  private _selectedDataButtonId = $state<string | undefined>(
    // Restore selected tab from localStorage on initialization
    typeof window !== 'undefined'
      ? localStorage.getItem(SELECTED_TAB_STORAGE_KEY) || undefined
      : undefined
  );

  private _isUpdatingSelection = false;
  private _pendingDatasetSelections = new Set<string>();

  constructor() {
    if (typeof window !== 'undefined' && this._selectedDataButtonId) {
      logger.debug('Restored selected tab from localStorage', LogCategory.STORE, {
        tabId: this._selectedDataButtonId
      });
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
      logger.debug('Dataset selection already pending', LogCategory.STORE, {
        sourceFileId
      });
      return;
    }

    this._pendingDatasetSelections.add(sourceFileId);
    datasetsStore
      .waitForDatasetBySourceFile(sourceFileId)
      .then((datasetId) => {
        if (this._selectedDataButtonId === sourceFileId) {
          logger.info('Deferred dataset selection resolved', LogCategory.STORE, {
            sourceFileId,
            datasetId
          });
          datasetsStore.selectDataset(datasetId);
        }
      })
      .catch((error) => {
        logger.error('Failed to wait for dataset selection', LogCategory.STORE, {
          sourceFileId,
          error: error instanceof Error ? error.message : error
        });
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
    // Guard against re-entrancy to prevent infinite loops
    if (this._isUpdatingSelection) {
      logger.warn('ensureTabSelected - Already updating, skipping', LogCategory.STORE);
      return;
    }

    this._isUpdatingSelection = true;
    try {
    const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];

    logger.debug('ensureTabSelected triggered', LogCategory.STORE, {
      sourceFilesCount: sourceFiles.length,
      selectedDataButtonId: this._selectedDataButtonId,
      firstFileId: sourceFiles[0]?.id
    });

    // If we have files but no selection, or selected file no longer exists
    if (sourceFiles.length > 0) {
      const selectedFileExists = sourceFiles.some(
        (f) => f.id === this._selectedDataButtonId
      );

      if (!this._selectedDataButtonId) {
        // Nothing selected yet, auto-select first file
        const firstFileId = sourceFiles[0].id;
        logger.info('Auto-selecting first tab', LogCategory.STORE, {
          firstFileId,
          reason: 'no_selection'
        });
        this.selectDataButton(firstFileId);
      } else if (!selectedFileExists) {
        const isPending = this._pendingDatasetSelections.has(
          this._selectedDataButtonId
        );
        if (isPending) {
          logger.info('Selected file not yet registered, waiting', LogCategory.STORE, {
            pendingFileId: this._selectedDataButtonId
          });
        } else {
          const firstFileId = sourceFiles[0].id;
          logger.info('Selected file removed, falling back to first', LogCategory.STORE, {
            oldId: this._selectedDataButtonId,
            fallbackId: firstFileId
          });
          this.selectDataButton(firstFileId);
        }
      }

      if (this._selectedDataButtonId) {
        this.ensureDatasetSelectionForSourceFile(this._selectedDataButtonId);
      }
    } else {
      // No files - clear selection
      if (this._selectedDataButtonId) {
        logger.debug('Clearing selection - no files', LogCategory.STORE);
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

    logger.debug('dataButtons $derived triggered', LogCategory.STORE, {
      sourceFilesCount: sourceFiles.length,
      sourceFileIds: sourceFiles.map(f => f.id),
      selectedDataButtonId: this._selectedDataButtonId
    });

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
    logger.debug('selectDataButton called', LogCategory.STORE, {
      newId: id,
      currentId: this._selectedDataButtonId,
      willUpdate: this._selectedDataButtonId !== id
    });

    if (this._selectedDataButtonId === id) return;
    this._selectedDataButtonId = id;

    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_TAB_STORAGE_KEY, id);
      logger.debug('Persisted selected tab to localStorage', LogCategory.STORE, { tabId: id });
    }

    this.ensureDatasetSelectionForSourceFile(id);
  }

  setProjectionFilter(id: ProjectionFilterId): void {
    this.projectionFilter = id;
  }

  setProjectionViewMode(mode: ProjectionViewMode): void {
    this.projectionViewMode = mode;
  }

  setZoomMode(mode: ZoomMode): void {
    this._state.zoom.mode = mode;
  }

  private adjustZoom(direction: 1 | -1): void {
    const isMap = this._state.zoom.mode === ZoomMode.Map;
    const currentLevel = isMap
      ? this._state.zoom.mapZoomLevel
      : this._state.zoom.pageZoomLevel;
    const step = isMap
      ? this._state.zoom.zoomStep
      : this._state.zoom.pageZoomStep;
    const minZoom = isMap
      ? this._state.zoom.minMapZoom
      : this._state.zoom.minPageZoom;
    const maxZoom = isMap
      ? this._state.zoom.maxMapZoom
      : this._state.zoom.maxPageZoom;

    const clamp = direction === 1 ? Math.min : Math.max;
    const limit = direction === 1 ? maxZoom : minZoom;
    const newZoomLevel = clamp(currentLevel + direction * step, limit);

    if (isMap) {
      this._state.zoom.mapZoomLevel = Math.round(newZoomLevel * 10) / 10;
      if (typeof window !== 'undefined') {
        localStorage.setItem(MAP_ZOOM_STORAGE_KEY, String(this._state.zoom.mapZoomLevel));
      }
    } else {
      this._state.zoom.pageZoomLevel = newZoomLevel;
      if (typeof window !== 'undefined') {
        localStorage.setItem(PAGE_ZOOM_STORAGE_KEY, String(this._state.zoom.pageZoomLevel));
      }
    }
  }

  zoomIn(): void {
    this.adjustZoom(1);
  }

  zoomOut(): void {
    this.adjustZoom(-1);
  }

  resetZoom(): void {
    if (this._state.zoom.mode === ZoomMode.Map) {
      this._state.zoom.mapZoomLevel = 100;
      if (typeof window !== 'undefined') {
        localStorage.setItem(MAP_ZOOM_STORAGE_KEY, '100');
      }
    } else {
      this._state.zoom.pageZoomLevel = 100;
      if (typeof window !== 'undefined') {
        localStorage.setItem(PAGE_ZOOM_STORAGE_KEY, '100');
      }
    }
  }

  setMapZoom(level: number): void {
    this._state.zoom.mapZoomLevel = Math.max(
      this._state.zoom.minMapZoom,
      Math.min(level, this._state.zoom.maxMapZoom)
    );
    if (typeof window !== 'undefined') {
      localStorage.setItem(MAP_ZOOM_STORAGE_KEY, String(this._state.zoom.mapZoomLevel));
    }
  }

  setPageZoom(level: number): void {
    this._state.zoom.pageZoomLevel = Math.max(
      this._state.zoom.minPageZoom,
      Math.min(level, this._state.zoom.maxPageZoom)
    );
    if (typeof window !== 'undefined') {
      localStorage.setItem(PAGE_ZOOM_STORAGE_KEY, String(this._state.zoom.pageZoomLevel));
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
  setZoomMode: globalState.setZoomMode.bind(globalState),
  zoomIn: globalState.zoomIn.bind(globalState),
  zoomOut: globalState.zoomOut.bind(globalState),
  resetZoom: globalState.resetZoom.bind(globalState),
  setMapZoom: globalState.setMapZoom.bind(globalState),
  setPageZoom: globalState.setPageZoom.bind(globalState)
};
