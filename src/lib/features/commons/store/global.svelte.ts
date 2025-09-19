import {
  ToolbarState,
  ToolbarStep,
  ZoomMode,
  type GlobalState,
  type ProjectionFilterId,
  type ProjectionViewMode
} from '$lib/features/commons/types/global';

export const globalState = $state<GlobalState>({
  settingPanel: false,
  mainPanel: true,
  isSideNavOpen: false,
  isCreateProjectModalOpen: false,
  selectedStep: ToolbarStep.Data,
  selectedTool: undefined,
  toolbarState: ToolbarState.Full,
  dataButtons: [],
  projectionFilter: 'all',
  projectionViewMode: 'list',
  zoom: {
    mode: ZoomMode.Map,
    mapZoomLevel: 1,
    pageZoomLevel: 100,
    minMapZoom: 0.1,
    maxMapZoom: 10,
    minPageZoom: 10,
    maxPageZoom: 500,
    zoomStep: 0.2,
    pageZoomStep: 10
  }
});

export const globalActions = {
  setNavigationState(selectedStep: ToolbarStep): void {
    globalState.selectedStep = selectedStep;

    if (selectedStep === ToolbarStep.Styling)
      globalState.toolbarState = ToolbarState.Collapsed;
    else if (globalState.toolbarState === ToolbarState.Collapsed)
      globalState.toolbarState = ToolbarState.Full;
  },

  setToolbarState(state: ToolbarState): void {
    globalState.toolbarState = state;
  },

  selectDataButton(id: string): void {
    // Check if already selected to avoid unnecessary updates
    const currentSelected = globalState.dataButtons.find(b => b.isSelected);
    if (currentSelected?.id === id) return;

    globalState.dataButtons.forEach((button) => {
      button.isSelected = button.id === id;
    });

    // Update the selected dataset in datasetsStore
    // The id is the fileId, we need to find the corresponding dataset
    import('../store/datasets.store.svelte').then(({ datasetsStore }) => {
      const dataset = datasetsStore.getDatasetBySourceFile(id);
      if (dataset && datasetsStore.selectedDatasetId !== dataset.id) {
        datasetsStore.selectDataset(dataset.id);
      }
    });
  },

  addDataButtonForFile(
    fileId: string,
    fileName: string,
    autoSelect: boolean = true
  ): void {
    const existingTab = globalState.dataButtons.find(
      (btn) => btn.id === fileId
    );
    if (existingTab) {
      if (autoSelect) {
        globalState.dataButtons.forEach((button) => {
          button.isSelected = button.id === fileId;
        });
      }
      return;
    }

    if (autoSelect) {
      globalState.dataButtons.forEach((button) => {
        button.isSelected = false;
      });
    }

    globalState.dataButtons.push({
      id: fileId,
      label: fileName,
      isSelected: autoSelect
    });
  },

  removeDataButton(fileId: string): void {
    const index = globalState.dataButtons.findIndex((btn) => btn.id === fileId);
    if (index > -1) {
      globalState.dataButtons.splice(index, 1);

      if (
        globalState.dataButtons.length > 0 &&
        !globalState.dataButtons.some((btn) => btn.isSelected)
      ) {
        globalState.dataButtons[0].isSelected = true;
      }
    }
  },

  clearAllDataButtons(): void {
    globalState.dataButtons = [];
  },

  setProjectionFilter(id: ProjectionFilterId): void {
    globalState.projectionFilter = id;
  },

  setProjectionViewMode(mode: ProjectionViewMode): void {
    globalState.projectionViewMode = mode;
  },

  setZoomMode(mode: ZoomMode): void {
    globalState.zoom.mode = mode;
  },

  zoomIn(): void {
    if (globalState.zoom.mode === ZoomMode.Map) {
      const newZoomLevel = Math.min(
        globalState.zoom.mapZoomLevel + globalState.zoom.zoomStep,
        globalState.zoom.maxMapZoom
      );
      globalState.zoom.mapZoomLevel = Math.round(newZoomLevel * 10) / 10;
    } else {
      const newZoomLevel = Math.min(
        globalState.zoom.pageZoomLevel + globalState.zoom.pageZoomStep,
        globalState.zoom.maxPageZoom
      );
      globalState.zoom.pageZoomLevel = newZoomLevel;
    }
  },

  zoomOut(): void {
    if (globalState.zoom.mode === ZoomMode.Map) {
      const newZoomLevel = Math.max(
        globalState.zoom.mapZoomLevel - globalState.zoom.zoomStep,
        globalState.zoom.minMapZoom
      );
      globalState.zoom.mapZoomLevel = Math.round(newZoomLevel * 10) / 10;
    } else {
      const newZoomLevel = Math.max(
        globalState.zoom.pageZoomLevel - globalState.zoom.pageZoomStep,
        globalState.zoom.minPageZoom
      );
      globalState.zoom.pageZoomLevel = newZoomLevel;
    }
  },

  resetZoom(): void {
    if (globalState.zoom.mode === ZoomMode.Map) {
      globalState.zoom.mapZoomLevel = 1;
    } else {
      globalState.zoom.pageZoomLevel = 100;
    }
  },

  setMapZoom(level: number): void {
    globalState.zoom.mapZoomLevel = Math.max(
      globalState.zoom.minMapZoom,
      Math.min(level, globalState.zoom.maxMapZoom)
    );
  },

  setPageZoom(level: number): void {
    globalState.zoom.pageZoomLevel = Math.max(
      globalState.zoom.minPageZoom,
      Math.min(level, globalState.zoom.maxPageZoom)
    );
  }
};
