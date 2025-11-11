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
      mapZoomLevel: 100,
      pageZoomLevel: 100,
      minMapZoom: 10,
      maxMapZoom: 1000,
      minPageZoom: 10,
      maxPageZoom: 500,
      zoomStep: 10,
      pageZoomStep: 10
    }
  });

  private _selectedDataButtonId = $state<string | undefined>(undefined);

  dataButtons = $derived.by(() => {
    const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];

    console.log('[GlobalStore] dataButtons $derived triggered', {
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
    console.log('[GlobalStore] selectDataButton called', {
      newId: id,
      currentId: this._selectedDataButtonId,
      willUpdate: this._selectedDataButtonId !== id
    });

    if (this._selectedDataButtonId === id) return;
    this._selectedDataButtonId = id;

    const dataset = datasetsStore.getDatasetBySourceFile(id);
    console.log('[GlobalStore] Looking for dataset by sourceFileId', {
      sourceFileId: id,
      foundDataset: !!dataset,
      datasetId: dataset?.id
    });

    if (dataset) {
      datasetsStore.selectDataset(dataset.id);
    }
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
    } else {
      this._state.zoom.pageZoomLevel = newZoomLevel;
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
    } else {
      this._state.zoom.pageZoomLevel = 100;
    }
  }

  setMapZoom(level: number): void {
    this._state.zoom.mapZoomLevel = Math.max(
      this._state.zoom.minMapZoom,
      Math.min(level, this._state.zoom.maxMapZoom)
    );
  }

  setPageZoom(level: number): void {
    this._state.zoom.pageZoomLevel = Math.max(
      this._state.zoom.minPageZoom,
      Math.min(level, this._state.zoom.maxPageZoom)
    );
  }
}

export const globalState = new GlobalStore();

export const globalActions = {
  setNavigationState: globalState.setNavigationState.bind(globalState),
  setToolbarState: globalState.setToolbarState.bind(globalState),
  selectDataButton: globalState.selectDataButton.bind(globalState),
  setProjectionFilter: globalState.setProjectionFilter.bind(globalState),
  setProjectionViewMode: globalState.setProjectionViewMode.bind(globalState),
  setZoomMode: globalState.setZoomMode.bind(globalState),
  zoomIn: globalState.zoomIn.bind(globalState),
  zoomOut: globalState.zoomOut.bind(globalState),
  resetZoom: globalState.resetZoom.bind(globalState),
  setMapZoom: globalState.setMapZoom.bind(globalState),
  setPageZoom: globalState.setPageZoom.bind(globalState)
};
