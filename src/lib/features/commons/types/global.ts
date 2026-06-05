export enum ToolbarState {
  Full = 'full',
  Collapsed = 'collapsed',
  Compact = 'compact'
}

export interface ZoomState {
  pageZoomLevel: number;
  minPageZoom: number;
  maxPageZoom: number;
  pageZoomStep: number;
  pagePanOffset: { x: number; y: number };
  pageZoomScale: number;
}

export interface GlobalState {
  settingPanel: boolean;
  mainPanel: boolean;
  isSideNavOpen: boolean;
  isCreateProjectModalOpen: boolean;
  isDuplicateModalOpen: boolean;
  isDeleteModalOpen: boolean;
  selectedStep: ToolbarStep;
  selectedTool?: StylingTools | VisualizationTools;
  toolbarState: ToolbarState;
  projectionFilter?: ProjectionFilterId;
  projectionViewMode?: ProjectionViewMode;
  zoom: ZoomState;
  isMobileView: boolean;
  isMobileToolbarOpen: boolean;
  isToolbarTransitioning: boolean;
}

export const enum ToolbarStep {
  Data = 'data',
  Visualizations = 'visualizations',
  Styling = 'styling'
}

export const enum StylingTools {
  Format = 'format',
  Legend = 'legend',
  GeoIndications = 'geo-indications',
  Annotations = 'annotations',
  ColorBlindness = 'color-blindness'
}

export const enum VisualizationTools {
  Search = 'search',
  Layers = 'layers',
  Projection = 'projection',
  Simplification = 'simplification',
  Facets = 'facets'
}

export type ProjectionFilterId =
  | 'all'
  | 'Rectangulaire'
  | 'Arrondie'
  | 'Discontinue';

export type ProjectionViewMode = 'list' | 'grid';
