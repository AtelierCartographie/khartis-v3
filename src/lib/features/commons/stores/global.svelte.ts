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
import { persistenceRegistry } from '$lib/features/project-management/core';
import { dataTabActions } from './data-tab.store.svelte';
import { datasetsStore } from './datasets.store.svelte';
import { projectStore } from './project.store.svelte';

export const MOBILE_BREAKPOINT = 1024;

interface SelectDataButtonOptions {
  notifyDataTabReset?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolbarStep(value: unknown): value is ToolbarStep {
  return (
    value === ToolbarStep.Data ||
    value === ToolbarStep.Visualizations ||
    value === ToolbarStep.Styling
  );
}

function isToolbarState(value: unknown): value is ToolbarState {
  return (
    value === ToolbarState.Full ||
    value === ToolbarState.Collapsed ||
    value === ToolbarState.Compact
  );
}

function isSelectedTool(
  value: unknown
): value is StylingTools | VisualizationTools {
  return (
    value === StylingTools.Format ||
    value === StylingTools.Legend ||
    value === StylingTools.GeoIndications ||
    value === StylingTools.Annotations ||
    value === StylingTools.ColorBlindness ||
    value === VisualizationTools.Search ||
    value === VisualizationTools.Layers ||
    value === VisualizationTools.Projection ||
    value === VisualizationTools.Simplification ||
    value === VisualizationTools.Facets
  );
}

function isProjectionFilterId(value: unknown): value is ProjectionFilterId {
  return (
    value === 'all' ||
    value === 'Rectangulaire' ||
    value === 'Arrondie' ||
    value === 'Discontinue'
  );
}

function isProjectionViewMode(value: unknown): value is ProjectionViewMode {
  return value === 'list' || value === 'grid';
}

function restorePageZoom(
  value: unknown,
  minPageZoom: number,
  maxPageZoom: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 100;
  }

  return Math.max(minPageZoom, Math.min(value, maxPageZoom));
}

function restorePanOffsetCoordinate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function resolveInitialToolbarState(step: ToolbarStep): ToolbarState {
  if (step === ToolbarStep.Styling) return ToolbarState.Collapsed;
  if (step === ToolbarStep.Visualizations) return ToolbarState.Compact;
  return ToolbarState.Full;
}

function createGlobalStore() {
  const initialStep = ToolbarStep.Data;
  const state = $state<GlobalState>({
    settingPanel: false,
    mainPanel: true,
    isSideNavOpen: false,
    isCreateProjectModalOpen: false,
    isDuplicateModalOpen: false,
    isDeleteModalOpen: false,
    selectedStep: initialStep,
    selectedTool: undefined,
    toolbarState: resolveInitialToolbarState(initialStep),
    projectionFilter: 'all',
    projectionViewMode: 'list',
    zoom: {
      pageZoomLevel: 100,
      minPageZoom: 10,
      maxPageZoom: 500,
      pageZoomStep: 10,
      pagePanOffset: { x: 0, y: 0 },
      pageZoomScale: 1
    },
    isMobileView:
      typeof window !== 'undefined'
        ? window.innerWidth < MOBILE_BREAKPOINT
        : false,
    isMobileToolbarOpen: false,
    isToolbarTransitioning: false,
    isMapExporting: false,
    isResizingMapFrame: false
  });
  const selectedDataButtonState = $state<{
    id: string | undefined;
  }>({
    id: undefined
  });
  let isUpdatingSelection = false;
  const pendingDatasetSelections = new Set<string>();

  function resetDataTabForSourceChange(
    previousSourceFileId: string | undefined,
    nextSourceFileId: string,
    options: SelectDataButtonOptions = {}
  ): void {
    if (previousSourceFileId === nextSourceFileId) {
      return;
    }

    dataTabActions.reset({ notify: options.notifyDataTabReset === true });
  }

  function selectDatasetForSourceFile(
    sourceFileId: string,
    datasetId: string,
    options: SelectDataButtonOptions = {}
  ): void {
    const previousSourceFileId = datasetsStore.selectedDataset?.sourceFileId;
    datasetsStore.selectDataset(datasetId);
    resetDataTabForSourceChange(previousSourceFileId, sourceFileId, options);
  }

  function ensureDatasetSelectionForSourceFile(
    sourceFileId: string,
    options: SelectDataButtonOptions = {}
  ): void {
    if (!sourceFileId) return;

    const dataset = datasetsStore.getDatasetBySourceFile(sourceFileId);
    if (dataset) {
      selectDatasetForSourceFile(sourceFileId, dataset.id, options);
      return;
    }

    if (pendingDatasetSelections.has(sourceFileId)) {
      return;
    }

    pendingDatasetSelections.add(sourceFileId);
    datasetsStore
      .waitForDatasetBySourceFile(sourceFileId)
      .then((datasetId) => {
        if (selectedDataButtonState.id === sourceFileId) {
          selectDatasetForSourceFile(sourceFileId, datasetId, options);
        }
      })
      .catch((error) => {
        const restoredDataset =
          datasetsStore.getDatasetBySourceFile(sourceFileId);
        if (restoredDataset) {
          if (selectedDataButtonState.id === sourceFileId) {
            selectDatasetForSourceFile(
              sourceFileId,
              restoredDataset.id,
              options
            );
          }
          return;
        }

        if (selectedDataButtonState.id !== sourceFileId) {
          return;
        }

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
        pendingDatasetSelections.delete(sourceFileId);
      });
  }

  function ensureTabSelected(): void {
    if (isUpdatingSelection) {
      return;
    }

    isUpdatingSelection = true;
    try {
      const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];

      if (sourceFiles.length > 0) {
        const selectedFileExists = sourceFiles.some(
          (file) => file.id === selectedDataButtonState.id
        );

        if (!selectedDataButtonState.id) {
          const firstFileId = sourceFiles[0].id;
          selectDataButton(firstFileId);
        } else if (!selectedFileExists) {
          const isPending = pendingDatasetSelections.has(
            selectedDataButtonState.id
          );
          if (!isPending) {
            const firstFileId = sourceFiles[0].id;
            selectDataButton(firstFileId);
          }
        }

        if (selectedDataButtonState.id) {
          ensureDatasetSelectionForSourceFile(selectedDataButtonState.id);
        }
      } else if (selectedDataButtonState.id) {
        selectedDataButtonState.id = undefined;
      }
    } finally {
      isUpdatingSelection = false;
    }
  }

  const dataButtons = $derived.by(() => {
    const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];

    return sourceFiles.map((file) => ({
      id: file.id,
      label: file.name,
      isSelected:
        file.id === selectedDataButtonState.id ||
        (sourceFiles.length === 1 && !selectedDataButtonState.id)
    }));
  });

  function notifyPersistence(): void {
    persistenceRegistry.notifyChange('globalUi');
  }

  function setMobileView(value: boolean): void {
    state.isMobileView = value;
    if (!value) {
      state.isMobileToolbarOpen = false;
    }
  }

  function openMobileToolbar(): void {
    state.isMobileToolbarOpen = true;
  }

  function closeMobileToolbar(): void {
    state.isMobileToolbarOpen = false;
  }

  function toggleMobileToolbar(): void {
    state.isMobileToolbarOpen = !state.isMobileToolbarOpen;
  }

  function setNavigationState(selectedStep: ToolbarStep): void {
    state.selectedStep = selectedStep;

    if (selectedStep === ToolbarStep.Styling) {
      state.toolbarState = ToolbarState.Collapsed;
    } else if (selectedStep === ToolbarStep.Visualizations) {
      state.toolbarState = ToolbarState.Compact;
    } else if (state.toolbarState === ToolbarState.Collapsed) {
      state.toolbarState = ToolbarState.Full;
    }

    notifyPersistence();
  }

  function setToolbarState(nextState: ToolbarState): void {
    if (state.selectedStep === ToolbarStep.Styling) {
      return;
    }

    state.toolbarState = nextState;
    notifyPersistence();
  }

  function setSelectedTool(
    tool: StylingTools | VisualizationTools | undefined
  ): void {
    state.selectedTool = tool;
    notifyPersistence();
  }

  function syncMapVisibilityWithSelectedTab(
    selectedSourceFileId: string
  ): void {
    datasetsStore.syncMapVisibilityWithSourceFile(selectedSourceFileId);
  }

  function selectDataButton(
    id: string,
    options: SelectDataButtonOptions = {}
  ): void {
    if (selectedDataButtonState.id === id) {
      return;
    }
    selectedDataButtonState.id = id;

    ensureDatasetSelectionForSourceFile(id, options);
    syncMapVisibilityWithSelectedTab(id);
    notifyPersistence();
  }

  function setProjectionFilter(id: ProjectionFilterId): void {
    state.projectionFilter = id;
    notifyPersistence();
  }

  function setProjectionViewMode(mode: ProjectionViewMode): void {
    state.projectionViewMode = mode;
    notifyPersistence();
  }

  function adjustPageZoom(direction: 1 | -1): void {
    const currentLevel = state.zoom.pageZoomLevel;
    const step = state.zoom.pageZoomStep;
    const minZoom = state.zoom.minPageZoom;
    const maxZoom = state.zoom.maxPageZoom;

    const clamp = direction === 1 ? Math.min : Math.max;
    const limit = direction === 1 ? maxZoom : minZoom;
    const newZoomLevel = clamp(currentLevel + direction * step, limit);

    state.zoom.pageZoomLevel = newZoomLevel;
    notifyPersistence();
  }

  function zoomInPage(): void {
    adjustPageZoom(1);
  }

  function zoomOutPage(): void {
    adjustPageZoom(-1);
  }

  function resetPageZoom(): void {
    state.zoom.pageZoomLevel = 100;
    state.zoom.pagePanOffset = { x: 0, y: 0 };
    notifyPersistence();
  }

  function panPageBy(deltaX: number, deltaY: number): void {
    state.zoom.pagePanOffset = {
      x: state.zoom.pagePanOffset.x + deltaX,
      y: state.zoom.pagePanOffset.y + deltaY
    };
    notifyPersistence();
  }

  function setPagePanOffset(offset: { x: number; y: number }): void {
    state.zoom.pagePanOffset = {
      x: offset.x,
      y: offset.y
    };
    notifyPersistence();
  }

  function resetPagePan(): void {
    state.zoom.pagePanOffset = { x: 0, y: 0 };
    notifyPersistence();
  }

  function setToolbarTransitioning(value: boolean): void {
    state.isToolbarTransitioning = value;
  }

  function setMapExporting(value: boolean): void {
    state.isMapExporting = value;
  }

  function setPageZoom(level: number): void {
    state.zoom.pageZoomLevel = Math.max(
      state.zoom.minPageZoom,
      Math.min(level, state.zoom.maxPageZoom)
    );
    notifyPersistence();
  }

  function setPageZoomScale(scale: number): void {
    const nextScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    if (Math.abs(state.zoom.pageZoomScale - nextScale) < 1e-4) return;
    state.zoom.pageZoomScale = nextScale;
  }

  if (typeof window !== 'undefined' && selectedDataButtonState.id) {
    const initialSelectedDataButtonId = selectedDataButtonState.id;
    queueMicrotask(() => {
      if (initialSelectedDataButtonId) {
        ensureDatasetSelectionForSourceFile(initialSelectedDataButtonId);
      }
    });
  }

  function resetNavigationState(): void {
    state.selectedStep = ToolbarStep.Data;
    state.toolbarState = ToolbarState.Full;
    state.selectedTool = undefined;
    state.projectionFilter = 'all';
    state.projectionViewMode = 'list';
    state.zoom.pageZoomLevel = 100;
    state.zoom.pagePanOffset = { x: 0, y: 0 };
    state.isMapExporting = false;
    state.isResizingMapFrame = false;

    selectedDataButtonState.id = undefined;
    pendingDatasetSelections.clear();
  }

  function restoreFromSerialized(data: unknown): void {
    const persisted = isRecord(data) ? data : {};
    const persistedPanOffset = isRecord(persisted.pagePanOffset)
      ? persisted.pagePanOffset
      : {};

    state.selectedStep = isToolbarStep(persisted.selectedStep)
      ? persisted.selectedStep
      : ToolbarStep.Data;
    state.selectedTool = isSelectedTool(persisted.selectedTool)
      ? persisted.selectedTool
      : undefined;
    state.toolbarState = isToolbarState(persisted.toolbarState)
      ? persisted.toolbarState
      : ToolbarState.Full;
    state.projectionFilter = isProjectionFilterId(persisted.projectionFilter)
      ? persisted.projectionFilter
      : 'all';
    state.projectionViewMode = isProjectionViewMode(
      persisted.projectionViewMode
    )
      ? persisted.projectionViewMode
      : 'list';
    state.zoom.pageZoomLevel = restorePageZoom(
      persisted.pageZoomLevel,
      state.zoom.minPageZoom,
      state.zoom.maxPageZoom
    );
    state.zoom.pagePanOffset = {
      x: restorePanOffsetCoordinate(persistedPanOffset.x),
      y: restorePanOffsetCoordinate(persistedPanOffset.y)
    };
    selectedDataButtonState.id =
      typeof persisted.selectedSourceFileId === 'string'
        ? persisted.selectedSourceFileId
        : undefined;
  }

  return {
    get dataButtons() {
      return dataButtons;
    },
    get selectedDataButtonId(): string | undefined {
      return selectedDataButtonState.id;
    },
    get settingPanel() {
      return state.settingPanel;
    },
    set settingPanel(value: boolean) {
      state.settingPanel = value;
    },
    get mainPanel() {
      return state.mainPanel;
    },
    set mainPanel(value: boolean) {
      state.mainPanel = value;
    },
    get isSideNavOpen() {
      return state.isSideNavOpen;
    },
    set isSideNavOpen(value: boolean) {
      state.isSideNavOpen = value;
    },
    get isCreateProjectModalOpen() {
      return state.isCreateProjectModalOpen;
    },
    set isCreateProjectModalOpen(value: boolean) {
      state.isCreateProjectModalOpen = value;
    },
    get isDuplicateModalOpen() {
      return state.isDuplicateModalOpen;
    },
    set isDuplicateModalOpen(value: boolean) {
      state.isDuplicateModalOpen = value;
    },
    get isDeleteModalOpen() {
      return state.isDeleteModalOpen;
    },
    set isDeleteModalOpen(value: boolean) {
      state.isDeleteModalOpen = value;
    },
    get selectedStep() {
      return state.selectedStep;
    },
    set selectedStep(value: ToolbarStep) {
      state.selectedStep = value;
      notifyPersistence();
    },
    get selectedTool() {
      return state.selectedTool;
    },
    set selectedTool(value: StylingTools | VisualizationTools | undefined) {
      state.selectedTool = value;
      notifyPersistence();
    },
    get toolbarState() {
      return state.toolbarState;
    },
    set toolbarState(value: ToolbarState) {
      state.toolbarState = value;
      notifyPersistence();
    },
    get projectionFilter(): ProjectionFilterId | undefined {
      return state.projectionFilter;
    },
    set projectionFilter(value: ProjectionFilterId | undefined) {
      state.projectionFilter = value;
      notifyPersistence();
    },
    get projectionViewMode(): ProjectionViewMode | undefined {
      return state.projectionViewMode;
    },
    set projectionViewMode(value: ProjectionViewMode | undefined) {
      state.projectionViewMode = value;
      notifyPersistence();
    },
    get zoom() {
      return state.zoom;
    },
    get isMobileView() {
      return state.isMobileView;
    },
    get isMobileToolbarOpen() {
      return state.isMobileToolbarOpen;
    },
    get isToolbarTransitioning() {
      return state.isToolbarTransitioning;
    },
    set isToolbarTransitioning(value: boolean) {
      state.isToolbarTransitioning = value;
    },
    get isMapExporting() {
      return state.isMapExporting;
    },
    get isResizingMapFrame() {
      return state.isResizingMapFrame;
    },
    set isResizingMapFrame(value: boolean) {
      state.isResizingMapFrame = value;
    },
    ensureTabSelected,
    setMobileView,
    openMobileToolbar,
    closeMobileToolbar,
    toggleMobileToolbar,
    setNavigationState,
    setToolbarState,
    setSelectedTool,
    selectDataButton,
    setProjectionFilter,
    setProjectionViewMode,
    zoomInPage,
    zoomOutPage,
    resetPageZoom,
    setPageZoom,
    setPageZoomScale,
    panPageBy,
    setPagePanOffset,
    resetPagePan,
    setToolbarTransitioning,
    setMapExporting,
    resetNavigationState,
    restoreFromSerialized
  };
}

export const globalState = createGlobalStore();

export const globalActions = {
  setNavigationState: globalState.setNavigationState,
  setToolbarState: globalState.setToolbarState,
  setSelectedTool: globalState.setSelectedTool,
  selectDataButton: globalState.selectDataButton,
  ensureTabSelected: globalState.ensureTabSelected,
  setProjectionFilter: globalState.setProjectionFilter,
  setProjectionViewMode: globalState.setProjectionViewMode,
  zoomInPage: globalState.zoomInPage,
  zoomOutPage: globalState.zoomOutPage,
  resetPageZoom: globalState.resetPageZoom,
  setPageZoom: globalState.setPageZoom,
  setPageZoomScale: globalState.setPageZoomScale,
  panPageBy: globalState.panPageBy,
  setPagePanOffset: globalState.setPagePanOffset,
  resetPagePan: globalState.resetPagePan,
  setMobileView: globalState.setMobileView,
  openMobileToolbar: globalState.openMobileToolbar,
  closeMobileToolbar: globalState.closeMobileToolbar,
  toggleMobileToolbar: globalState.toggleMobileToolbar,
  setToolbarTransitioning: globalState.setToolbarTransitioning,
  setMapExporting: globalState.setMapExporting,
  resetNavigationState: globalState.resetNavigationState
};

persistenceRegistry.register({
  key: 'globalUi',
  serialize: () => ({
    selectedStep: globalState.selectedStep,
    selectedTool: globalState.selectedTool,
    toolbarState: globalState.toolbarState,
    projectionFilter: globalState.projectionFilter,
    projectionViewMode: globalState.projectionViewMode,
    selectedSourceFileId: globalState.selectedDataButtonId,
    pageZoomLevel: globalState.zoom.pageZoomLevel,
    pagePanOffset: globalState.zoom.pagePanOffset
  }),
  deserialize: (data: unknown) => globalState.restoreFromSerialized(data),
  reset: () => globalState.resetNavigationState(),
  priority: 'debounced'
});
