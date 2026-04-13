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
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import { datasetsStore } from './datasets.store.svelte';
import { projectStore } from './project.store.svelte';

const SELECTED_TAB_STORAGE_KEY = 'khartis_selected_tab';
const PAGE_ZOOM_STORAGE_KEY = 'khartis_page_zoom_level';
const TOOLBAR_STATE_STORAGE_KEY = 'khartis_toolbar_state';
const SELECTED_STEP_STORAGE_KEY = 'khartis_selected_step';
const MOBILE_BREAKPOINT_VALUE = 1024;

const VALID_TOOLBAR_STATES = new Set<string>([
  ToolbarState.Full,
  ToolbarState.Compact,
  ToolbarState.Collapsed
]);

const VALID_TOOLBAR_STEPS = new Set<string>([
  ToolbarStep.Data,
  ToolbarStep.Visualizations,
  ToolbarStep.Styling
]);

function readToolbarStateFromStorage(): ToolbarState {
  if (typeof window === 'undefined') return ToolbarState.Full;
  const stored = localStorage.getItem(TOOLBAR_STATE_STORAGE_KEY);
  if (stored && VALID_TOOLBAR_STATES.has(stored)) return stored as ToolbarState;
  return ToolbarState.Full;
}

function readStepFromStorage(): ToolbarStep {
  if (typeof window === 'undefined') return ToolbarStep.Data;
  const stored = localStorage.getItem(SELECTED_STEP_STORAGE_KEY);
  if (stored && VALID_TOOLBAR_STEPS.has(stored)) return stored as ToolbarStep;
  return ToolbarStep.Data;
}

function resolveInitialToolbarState(step: ToolbarStep): ToolbarState {
  if (step === ToolbarStep.Styling) return ToolbarState.Collapsed;
  if (step === ToolbarStep.Visualizations) return ToolbarState.Compact;
  return readToolbarStateFromStorage();
}

function createGlobalStore() {
  const initialStep = readStepFromStorage();
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
      pageZoomLevel:
        typeof window !== 'undefined'
          ? Number(localStorage.getItem(PAGE_ZOOM_STORAGE_KEY)) || 100
          : 100,
      minPageZoom: 10,
      maxPageZoom: 500,
      pageZoomStep: 10,
      pagePanOffset: { x: 0, y: 0 }
    },
    isMobileView:
      typeof window !== 'undefined'
        ? window.innerWidth < MOBILE_BREAKPOINT_VALUE
        : false,
    isMobileToolbarOpen: false,
    isToolbarTransitioning: false
  });
  const selectedDataButtonState = $state<{
    id: string | undefined;
  }>({
    id:
      typeof window !== 'undefined'
        ? localStorage.getItem(SELECTED_TAB_STORAGE_KEY) || undefined
        : undefined
  });
  let isUpdatingSelection = false;
  const pendingDatasetSelections = new Set<string>();

  function ensureDatasetSelectionForSourceFile(sourceFileId: string): void {
    if (!sourceFileId) return;

    const dataset = datasetsStore.getDatasetBySourceFile(sourceFileId);
    if (dataset) {
      datasetsStore.selectDataset(dataset.id);
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
        logger.info(
          '[global-store] clearing selected data button because project has no source files',
          LogCategory.UI,
          {
            previousSelectedDataButtonId: selectedDataButtonState.id
          }
        );
        selectedDataButtonState.id = undefined;
        if (typeof window !== 'undefined') {
          localStorage.removeItem(SELECTED_TAB_STORAGE_KEY);
        }
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

  function syncSelectedStepToStorage(selectedStep: ToolbarStep): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_STEP_STORAGE_KEY, selectedStep);
    }
  }

  function syncToolbarStateToStorage(toolbarState: ToolbarState): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOOLBAR_STATE_STORAGE_KEY, toolbarState);
    }
  }

  function syncSelectedTabToStorage(id: string | undefined): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (id) {
      localStorage.setItem(SELECTED_TAB_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(SELECTED_TAB_STORAGE_KEY);
    }
  }

  function syncPageZoomToStorage(pageZoomLevel: number): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PAGE_ZOOM_STORAGE_KEY, String(pageZoomLevel));
    }
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
      const preferred = readToolbarStateFromStorage();
      state.toolbarState =
        preferred === ToolbarState.Collapsed ? ToolbarState.Full : preferred;
    }

    syncSelectedStepToStorage(selectedStep);
    notifyPersistence();
  }

  function setToolbarState(nextState: ToolbarState): void {
    if (state.selectedStep === ToolbarStep.Styling) {
      return;
    }

    state.toolbarState = nextState;
    syncToolbarStateToStorage(nextState);
    notifyPersistence();
  }

  function syncMapVisibilityWithSelectedTab(
    selectedSourceFileId: string
  ): void {
    const allDatasets = datasetsStore.datasets;

    for (const dataset of allDatasets) {
      if (dataset.sourceFileId === selectedSourceFileId) {
        datasetsStore.enableDataset(dataset.id);
      } else {
        datasetsStore.disableDataset(dataset.id);
      }
    }
  }

  function selectDataButton(id: string): void {
    if (selectedDataButtonState.id === id) {
      return;
    }
    selectedDataButtonState.id = id;

    syncSelectedTabToStorage(id);

    ensureDatasetSelectionForSourceFile(id);
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
    syncPageZoomToStorage(state.zoom.pageZoomLevel);
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
    syncPageZoomToStorage(100);
    notifyPersistence();
  }

  function panPageBy(deltaX: number, deltaY: number): void {
    state.zoom.pagePanOffset = {
      x: state.zoom.pagePanOffset.x + deltaX,
      y: state.zoom.pagePanOffset.y + deltaY
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

  function setPageZoom(level: number): void {
    state.zoom.pageZoomLevel = Math.max(
      state.zoom.minPageZoom,
      Math.min(level, state.zoom.maxPageZoom)
    );
    syncPageZoomToStorage(state.zoom.pageZoomLevel);
    notifyPersistence();
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

    selectedDataButtonState.id = undefined;
    pendingDatasetSelections.clear();

    syncSelectedStepToStorage(ToolbarStep.Data);
    syncToolbarStateToStorage(ToolbarState.Full);
    syncSelectedTabToStorage(undefined);
    syncPageZoomToStorage(100);
  }

  function restoreFromSerialized(data: unknown): void {
    const persisted = (data ?? {}) as {
      selectedStep?: ToolbarStep;
      selectedTool?: StylingTools | VisualizationTools;
      toolbarState?: ToolbarState;
      projectionFilter?: ProjectionFilterId;
      projectionViewMode?: ProjectionViewMode;
      selectedSourceFileId?: string;
      pageZoomLevel?: number;
      pagePanOffset?: { x?: number; y?: number };
    };

    state.selectedStep = persisted.selectedStep ?? ToolbarStep.Data;
    state.selectedTool = persisted.selectedTool;
    state.toolbarState = persisted.toolbarState ?? ToolbarState.Full;
    state.projectionFilter = persisted.projectionFilter ?? 'all';
    state.projectionViewMode = persisted.projectionViewMode ?? 'list';
    state.zoom.pageZoomLevel =
      typeof persisted.pageZoomLevel === 'number'
        ? Math.max(
            state.zoom.minPageZoom,
            Math.min(persisted.pageZoomLevel, state.zoom.maxPageZoom)
          )
        : 100;
    state.zoom.pagePanOffset = {
      x: persisted.pagePanOffset?.x ?? 0,
      y: persisted.pagePanOffset?.y ?? 0
    };
    selectedDataButtonState.id = persisted.selectedSourceFileId;

    syncSelectedStepToStorage(state.selectedStep);
    syncToolbarStateToStorage(state.toolbarState);
    syncSelectedTabToStorage(selectedDataButtonState.id);
    syncPageZoomToStorage(state.zoom.pageZoomLevel);
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
      syncSelectedStepToStorage(value);
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
      syncToolbarStateToStorage(value);
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
    ensureTabSelected,
    setMobileView,
    openMobileToolbar,
    closeMobileToolbar,
    toggleMobileToolbar,
    setNavigationState,
    setToolbarState,
    selectDataButton,
    setProjectionFilter,
    setProjectionViewMode,
    zoomInPage,
    zoomOutPage,
    resetPageZoom,
    setPageZoom,
    panPageBy,
    resetPagePan,
    setToolbarTransitioning,
    resetNavigationState,
    restoreFromSerialized
  };
}

export const globalState = createGlobalStore();

export const globalActions = {
  setNavigationState: globalState.setNavigationState,
  setToolbarState: globalState.setToolbarState,
  selectDataButton: globalState.selectDataButton,
  ensureTabSelected: globalState.ensureTabSelected,
  setProjectionFilter: globalState.setProjectionFilter,
  setProjectionViewMode: globalState.setProjectionViewMode,
  zoomInPage: globalState.zoomInPage,
  zoomOutPage: globalState.zoomOutPage,
  resetPageZoom: globalState.resetPageZoom,
  setPageZoom: globalState.setPageZoom,
  panPageBy: globalState.panPageBy,
  resetPagePan: globalState.resetPagePan,
  setMobileView: globalState.setMobileView,
  openMobileToolbar: globalState.openMobileToolbar,
  closeMobileToolbar: globalState.closeMobileToolbar,
  toggleMobileToolbar: globalState.toggleMobileToolbar,
  setToolbarTransitioning: globalState.setToolbarTransitioning,
  resetNavigationState: globalState.resetNavigationState
};

export const MOBILE_BREAKPOINT = 1024;

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
