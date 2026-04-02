import type {
  ColumnTransformation,
  UploadedFile
} from '$lib/features/commons/store/create-project.types';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
import type { BasemapLayerConfig } from '$lib/features/map/stores/basemap-layers.store.svelte';
import type { MapProjectionType } from '$lib/features/map/stores/map-projection.store.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { AnnotationsState } from '$lib/features/step-toolbar/tools/annotations/annotations.types';
import type { FormatState } from '$lib/features/step-toolbar/tools/format/format.types';
import type { GeoIndicationsState } from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.types';
import type { LegendState } from '$lib/features/step-toolbar/tools/legend/legend.types';
import type { ProjectionState } from '$lib/features/step-toolbar/tools/projections/projections.types';

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
  referenceBasemapId?: string | null;
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
  annotations: Omit<AnnotationsState, 'selectedId' | 'textContent'>;
  legend: Omit<LegendState, 'activeTab'>;
  geoIndications: GeoIndicationsState;
  projection: Omit<ProjectionState, 'viewMode' | 'autoFit'>;
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
