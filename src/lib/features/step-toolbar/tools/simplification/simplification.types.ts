import {
  BasemapLayerType,
  SimplificationTarget
} from '$lib/features/commons/constants/ui.constants';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';

export interface SimplificationResult {
  type: SimplificationTarget;
  simplified: boolean;
  vertexReduction: number;
  originalVertices: number;
  simplifiedVertices: number;
  level?: SimplificationLevel;
  rate?: number;
  datasetId?: string;
  datasetSourceFileId?: string;
  datasetBaseTableName?: string;
  datasetSimplifiedTableName?: string;
  /** Level active before applying a catalog basemap variant (for undo). */
  previousBasemapLevel?: SimplificationLevel;
  /** Raw table name containing the original custom basemap geometry (for undo). */
  previousBasemapTableName?: string;
  /** Primary layer type of the custom basemap (for undo helper table refresh). */
  primaryLayerType?: BasemapLayerType;
}

export interface SimplificationState {
  source: SimplificationSource;
  level: SimplificationLevel;
  rate: number;
  isProcessing: boolean;
  lastApplied?: {
    source: SimplificationSource;
    level?: SimplificationLevel;
    rate?: number;
    basemapId?: string;
    datasetId?: string;
    datasetSourceFileId?: string;
    datasetBaseTableName?: string;
    datasetSimplifiedTableName?: string;
    timestamp: number;
    /** Level active before applying a catalog basemap variant (for undo). */
    previousBasemapLevel?: SimplificationLevel;
    /** Raw table name containing the original custom basemap geometry (for undo). */
    previousBasemapTableName?: string;
    /** Primary layer type of the custom basemap (for undo helper table refresh). */
    primaryLayerType?: BasemapLayerType;
  };
}
