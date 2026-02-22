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
const TOOLBAR_STATE_STORAGE_KEY = 'khartis_toolbar_state';
const MOBILE_BREAKPOINT_VALUE = 1024;

const VALID_TOOLBAR_STATES = new Set<string>([
  ToolbarState.Full,
  ToolbarState.Compact,
  ToolbarState.Collapsed
]);

function readToolbarStateFromStorage(): ToolbarState {
  if (typeof window === 'undefined') return ToolbarState.Full;
  const stored = localStorage.getItem(TOOLBAR_STATE_STORAGE_KEY);
  if (stored && VALID_TOOLBAR_STATES.has(stored)) return stored as ToolbarState;
  return ToolbarState.Full;
}

function createGlobalStore() {
  const state = $state<GlobalState>({
    settingPanel: false,
    mainPanel: true,
    isSideNavOpen: false,
    isCreateProjectModalOpen: false,
    isDuplicateModalOpen: false,
    isDeleteModalOpen: false,
    selectedStep: ToolbarStep.Data,
    selectedTool: undefined,
    toolbarState: readToolbarStateFromStorage(),
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

  function getCallerHint(): string | undefined {
    const stack = new Error().stack;
    if (!stack) return undefined;
    const caller = stack
      .split('\n')
      .slice(3, 5)
      .map((line) => line.trim())
      .join(' | ');
    return caller || undefined;
  }

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
    const previousStep = state.selectedStep;
    const previousToolbarState = state.toolbarState;
    state.selectedStep = selectedStep;

    if (selectedStep === ToolbarStep.Styling) {
      state.toolbarState = ToolbarState.Collapsed;
    } else if (state.toolbarState === ToolbarState.Collapsed) {
      const preferred = readToolbarStateFromStorage();
      state.toolbarState =
        preferred === ToolbarState.Collapsed ? ToolbarState.Full : preferred;
    }

    if (
      previousStep !== selectedStep ||
      previousToolbarState !== state.toolbarState
    ) {
      logger.info('[global-store] navigation state changed', LogCategory.UI, {
        fromStep: previousStep,
        toStep: selectedStep,
        fromToolbarState: previousToolbarState,
        toToolbarState: state.toolbarState,
        caller: getCallerHint()
      });
    }
  }

  function setToolbarState(nextState: ToolbarState): void {
    const previousToolbarState = state.toolbarState;
    state.toolbarState = nextState;
    if (previousToolbarState !== nextState) {
      logger.info('[global-store] toolbar state changed', LogCategory.UI, {
        fromToolbarState: previousToolbarState,
        toToolbarState: nextState,
        selectedStep: state.selectedStep,
        caller: getCallerHint()
      });
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOOLBAR_STATE_STORAGE_KEY, nextState);
    }
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
    const previousSelectedDataButtonId = selectedDataButtonState.id;
    selectedDataButtonState.id = id;

    logger.debug('[global-store] data tab selection changed', LogCategory.UI, {
      previousSelectedDataButtonId,
      selectedDataButtonId: id
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_TAB_STORAGE_KEY, id);
    }

    ensureDatasetSelectionForSourceFile(id);
    syncMapVisibilityWithSelectedTab(id);
  }

  function setProjectionFilter(id: ProjectionFilterId): void {
    state.projectionFilter = id;
  }

  function setProjectionViewMode(mode: ProjectionViewMode): void {
    state.projectionViewMode = mode;
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
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        PAGE_ZOOM_STORAGE_KEY,
        String(state.zoom.pageZoomLevel)
      );
    }
  }

  function zoomInPage(): void {
    adjustPageZoom(1);
  }

  function zoomOutPage(): void {
    adjustPageZoom(-1);
  }

  function resetPageZoom(): void {
    state.zoom.pageZoomLevel = 100;
    if (typeof window !== 'undefined') {
      localStorage.setItem(PAGE_ZOOM_STORAGE_KEY, '100');
    }
  }

  function setToolbarTransitioning(value: boolean): void {
    state.isToolbarTransitioning = value;
  }

  function setPageZoom(level: number): void {
    state.zoom.pageZoomLevel = Math.max(
      state.zoom.minPageZoom,
      Math.min(level, state.zoom.maxPageZoom)
    );
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        PAGE_ZOOM_STORAGE_KEY,
        String(state.zoom.pageZoomLevel)
      );
    }
  }

  if (typeof window !== 'undefined' && selectedDataButtonState.id) {
    const initialSelectedDataButtonId = selectedDataButtonState.id;
    queueMicrotask(() => {
      if (initialSelectedDataButtonId) {
        ensureDatasetSelectionForSourceFile(initialSelectedDataButtonId);
      }
    });
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
    },
    get selectedTool() {
      return state.selectedTool;
    },
    set selectedTool(value: StylingTools | VisualizationTools | undefined) {
      state.selectedTool = value;
    },
    get toolbarState() {
      return state.toolbarState;
    },
    set toolbarState(value: ToolbarState) {
      state.toolbarState = value;
    },
    get projectionFilter(): ProjectionFilterId | undefined {
      return state.projectionFilter;
    },
    set projectionFilter(value: ProjectionFilterId | undefined) {
      state.projectionFilter = value;
    },
    get projectionViewMode(): ProjectionViewMode | undefined {
      return state.projectionViewMode;
    },
    set projectionViewMode(value: ProjectionViewMode | undefined) {
      state.projectionViewMode = value;
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
    setToolbarTransitioning
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
  setMobileView: globalState.setMobileView,
  openMobileToolbar: globalState.openMobileToolbar,
  closeMobileToolbar: globalState.closeMobileToolbar,
  toggleMobileToolbar: globalState.toggleMobileToolbar,
  setToolbarTransitioning: globalState.setToolbarTransitioning
};

export const MOBILE_BREAKPOINT = 1024;
