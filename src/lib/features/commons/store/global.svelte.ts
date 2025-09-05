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
  isCreateProjectModalOpen: true,
  isAddDataModalOpen: false,
  selectedStep: ToolbarStep.Data,
  selectedTool: undefined,
  toolbarState: ToolbarState.Full,
  dataButtons: [{ id: 'data-1', label: 'Lorem', isSelected: true }],
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
    globalState.dataButtons.forEach((button) => {
      button.isSelected = button.id === id;
    });
  },

  setProjectionFilter(id: ProjectionFilterId): void {
    globalState.projectionFilter = id;
  },

  setProjectionViewMode(mode: ProjectionViewMode): void {
    globalState.projectionViewMode = mode;
  },

  setZoomMode(mode: ZoomMode): void {
    globalState.zoom.mode = mode;
    console.log(`Zoom mode changed to: ${mode}`);
  },

  zoomIn(): void {
    if (globalState.zoom.mode === ZoomMode.Map) {
      const newZoomLevel = Math.min(
        globalState.zoom.mapZoomLevel + globalState.zoom.zoomStep,
        globalState.zoom.maxMapZoom
      );
      globalState.zoom.mapZoomLevel = Math.round(newZoomLevel * 10) / 10;
      console.log(`Map zoom in: ${globalState.zoom.mapZoomLevel}`);
    } else {
      const newZoomLevel = Math.min(
        globalState.zoom.pageZoomLevel + globalState.zoom.pageZoomStep,
        globalState.zoom.maxPageZoom
      );
      globalState.zoom.pageZoomLevel = newZoomLevel;
      console.log(`Page zoom in: ${globalState.zoom.pageZoomLevel}%`);
    }
  },

  zoomOut(): void {
    if (globalState.zoom.mode === ZoomMode.Map) {
      const newZoomLevel = Math.max(
        globalState.zoom.mapZoomLevel - globalState.zoom.zoomStep,
        globalState.zoom.minMapZoom
      );
      globalState.zoom.mapZoomLevel = Math.round(newZoomLevel * 10) / 10;
      console.log(`Map zoom out: ${globalState.zoom.mapZoomLevel}`);
    } else {
      const newZoomLevel = Math.max(
        globalState.zoom.pageZoomLevel - globalState.zoom.pageZoomStep,
        globalState.zoom.minPageZoom
      );
      globalState.zoom.pageZoomLevel = newZoomLevel;
      console.log(`Page zoom out: ${globalState.zoom.pageZoomLevel}%`);
    }
  },

  resetZoom(): void {
    if (globalState.zoom.mode === ZoomMode.Map) {
      globalState.zoom.mapZoomLevel = 1;
      console.log('Map zoom reset to 1');
    } else {
      globalState.zoom.pageZoomLevel = 100;
      console.log('Page zoom reset to 100%');
    }
  },

  setMapZoom(level: number): void {
    globalState.zoom.mapZoomLevel = Math.max(
      globalState.zoom.minMapZoom,
      Math.min(level, globalState.zoom.maxMapZoom)
    );
    console.log(`Map zoom set to: ${globalState.zoom.mapZoomLevel}`);
  },

  setPageZoom(level: number): void {
    globalState.zoom.pageZoomLevel = Math.max(
      globalState.zoom.minPageZoom,
      Math.min(level, globalState.zoom.maxPageZoom)
    );
    console.log(`Page zoom set to: ${globalState.zoom.pageZoomLevel}%`);
  }
};
