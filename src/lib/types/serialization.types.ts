import type {
  ColumnTransformation,
  UploadedFile
} from '$lib/features/commons/store/create-project.types';
import type { DataTabState } from '$lib/features/commons/store/data-tab.types';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { ZoomMode } from '$lib/features/commons/store/zoom-mode.store.svelte';
import type {
  ProjectionFilterId,
  ProjectionViewMode,
  StylingTools,
  ToolbarState,
  ToolbarStep,
  VisualizationTools
} from '$lib/features/commons/types/global';
import type { DatasetResult } from '$lib/features/data-pipeline';
import type { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
import type { BasemapLayerConfig } from '$lib/features/map/stores/basemap-layers.store.svelte';
import type { MapProjectionType } from '$lib/features/map/stores/map-projection.store.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { AnnotationsState } from '$lib/features/step-toolbar/tools/annotations/annotations.types';
import type { ColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.types';
import type { FacetsState } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
import type { FormatState } from '$lib/features/step-toolbar/tools/format/format.types';
import type { GeoIndicationsState } from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.types';
import type { LegendState } from '$lib/features/step-toolbar/tools/legend/legend.types';
import type { ProjectionState } from '$lib/features/step-toolbar/tools/projections/projections.types';
import type { SearchState } from '$lib/features/step-toolbar/tools/search/search.types';
import type { SimplificationState } from '$lib/features/step-toolbar/tools/simplification/simplification.types';
import type { DataTableFilterInput } from '$lib/features/duckdb';
import type { DataToolsState } from '$lib/features/main-toolbar/data-tab/data-tools.store.svelte';
import type { DataTabWorkflowState } from '$lib/features/main-toolbar/data-tab/data-tab.store.svelte';

export interface SerializedProject {
  id: string;
  manifest: {
    version: string;
    createdAt: string; // ISO date string
    updatedAt: string; // ISO date string
    name: string;
    description?: string;
  };
  data?: SerializedProjectData;
  visualization?: unknown; // TODO: Type visualization state
  layout?: unknown; // TODO: Type layout state
  resources?: unknown; // TODO: Type resources
}

export interface SerializedBasemapAttribute {
  raw: string;
  id: string;
  variant: string;
  normalized: string;
  basemap: string;
  basemap_count: number;
}

export interface SerializedBasemapSettings {
  layers: BasemapLayerConfig[];
  style: BasemapStyle;
  mapProjection: MapProjectionType;
  lastSelectedTiledStyle?: BasemapStyle | null;
  referenceBasemapId?: string | null;
  showLabels?: boolean;
  groupVisibility?: Record<string, boolean>;
  mapViewState?: {
    zoom: number;
    target: [number, number, number];
  };
}

export interface SerializedVisualizationSettings {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: string[];
}

export interface SerializedLayoutSettings {
  format: FormatState;
  annotations: Omit<
    AnnotationsState,
    'selectedId' | 'textContent' | 'isDrawingMode' | 'drawingInProgress'
  >;
  legend: Omit<LegendState, 'activeTab'>;
  geoIndications: GeoIndicationsState;
  projection: Omit<ProjectionState, 'suggestions'>;
}

export interface SerializedGlobalUiState {
  selectedStep: ToolbarStep;
  selectedTool?: StylingTools | VisualizationTools;
  toolbarState: ToolbarState;
  projectionFilter?: ProjectionFilterId;
  projectionViewMode?: ProjectionViewMode;
  selectedSourceFileId?: string;
  pageZoomLevel: number;
  pagePanOffset: {
    x: number;
    y: number;
  };
}

export interface SerializedDatasetsViewState {
  enabledSourceFileIds: string[];
  hiddenColumnsBySourceFileId: Record<string, string[]>;
  simplificationBySourceFileId: Record<
    string,
    NonNullable<DatasetResult['simplificationApplied']>
  >;
}

export interface SerializedTableFilterRecord extends DataTableFilterInput {
  id: string;
}

export interface SerializedTableFiltersState {
  filtersBySourceFileId: Record<string, SerializedTableFilterRecord[]>;
}

export type SerializedSearchState = Omit<
  SearchState,
  'results' | 'currentResultIndex' | 'isSearching'
>;

export type SerializedSimplificationState = Omit<
  SimplificationState,
  'isProcessing'
>;

export interface SerializedUiSettings {
  globalUi?: SerializedGlobalUiState;
  zoomMode?: ZoomMode;
  dataTab?: DataTabState;
  dataWorkflow?: DataTabWorkflowState;
  dataTools?: DataToolsState;
  datasetsView?: SerializedDatasetsViewState;
  tableFilters?: SerializedTableFiltersState;
  colorBlindness?: ColorBlindnessState;
  facets?: FacetsState;
  search?: SerializedSearchState;
  simplification?: SerializedSimplificationState;
}

export interface SerializedProjectData {
  sourceFiles?: SerializedUploadedFile[];
  customBasemaps?: {
    metadata: BasemapMetadata[];
    attributes: SerializedBasemapAttribute[];
  };
  basemapSettings?: SerializedBasemapSettings;
  visualizationSettings?: SerializedVisualizationSettings;
  layoutSettings?: SerializedLayoutSettings;
  uiSettings?: SerializedUiSettings;
  [key: string]: unknown;
}

/**
 * Serialized uploaded file structure
 * ArrayBuffer content is stored as Uint8Array (IndexedDB) or number[] (legacy JSON)
 */
export interface SerializedUploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fileType: string;
  status: 'uploading' | 'processing' | 'complete' | 'error' | 'edit';
  errorMessage?: string;
  validation?: unknown;
  sourceType?: string;
  relatedFiles?: string[];
  relatedFilesData?: Record<string, number[] | Uint8Array>;
  uploadProgress?: number;
  parsedData?: unknown;
  statistics?: unknown;
  preparedGeoJSON?: string;
  duplicates?: UploadedFile['duplicates'];
  deepAnalysis?: UploadedFile['deepAnalysis'];
  geoMatchResult?: UploadedFile['geoMatchResult'];
  columnTransformations?: ColumnTransformation[];
  deletedRowIds?: number[];
  content?: string | number[] | Uint8Array;
  contentType?: 'string' | 'arraybuffer';
  // Join state persistence
  joinedBasemap?: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: { lat: string; lon: string };
  // ZIP multi-file support
  sourceArchive?: string;
  duckdbTableName?: string;
  // Stable dataset ID — reused on restore so visualization.datasetId references remain valid
  datasetId?: string;
}
