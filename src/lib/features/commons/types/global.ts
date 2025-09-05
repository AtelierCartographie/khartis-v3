export enum ToolbarState {
  Full = 'full',
  Collapsed = 'collapsed',
  Compact = 'compact'
}

export enum ZoomMode {
  Map = 'map',
  Page = 'page'
}

export interface ZoomState {
  mode: ZoomMode;
  mapZoomLevel: number;
  pageZoomLevel: number;
  minMapZoom: number;
  maxMapZoom: number;
  minPageZoom: number;
  maxPageZoom: number;
  zoomStep: number;
  pageZoomStep: number;
}

export interface DataButton {
  id: string;
  label: string;
  isSelected: boolean;
}

export interface GlobalState {
  settingPanel: boolean;
  mainPanel: boolean;
  isSideNavOpen: boolean;
  isCreateProjectModalOpen: boolean;
  isAddDataModalOpen: boolean;
  selectedStep: ToolbarStep;
  selectedTool?: StylingTools | VisualizationTools;
  toolbarState: ToolbarState;
  dataButtons: DataButton[];
  projectionFilter?: ProjectionFilterId;
  projectionViewMode?: ProjectionViewMode;
  zoom: ZoomState;
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

export enum ProjectionSection {
  Main = 'main',
  Other = 'other',
  Settings = 'settings'
}
