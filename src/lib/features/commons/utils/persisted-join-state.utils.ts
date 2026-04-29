import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import {
  detectGPSColumns,
  type GPSColumns
} from '$lib/features/duckdb/orchestrator/gps-ops';
import type { AnalysisResult, DuckDBDataset } from '$lib/features/duckdb/types';

const OSM_BASEMAP_PREFIX = 'osm_';

type DuckDatasetJoinState = Pick<
  DuckDBDataset,
  | 'joinedBasemap'
  | 'geoColumn'
  | 'gpsMode'
  | 'gpsColumns'
  | 'columns'
  | 'geoDetection'
>;

interface ResolvePersistedJoinStateOptions {
  file: Pick<
    UploadedFile,
    'joinedBasemap' | 'geoColumn' | 'gpsMode' | 'gpsColumns' | 'joinCorrections'
  >;
  duckDataset?: DuckDatasetJoinState | null;
  selectedBasemapId?: string | null;
  linkedGeoColumn?: string | null;
  selectedGpsColumns?: GPSColumns;
  isSelectedSourceFile?: boolean;
}

interface PersistedJoinState {
  joinedBasemap?: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: GPSColumns;
  joinCorrections?: Record<string, string>;
}

function isOSMBasemapId(basemapId?: string | null): basemapId is string {
  return (
    typeof basemapId === 'string' && basemapId.startsWith(OSM_BASEMAP_PREFIX)
  );
}

function resolveDatasetGpsColumns(
  duckDataset?: DuckDatasetJoinState | null
): GPSColumns | undefined {
  if (!duckDataset) {
    return undefined;
  }

  return (
    duckDataset.gpsColumns ??
    detectGPSColumns(
      (duckDataset.columns ?? []) as AnalysisResult[],
      duckDataset.geoDetection
    ) ??
    undefined
  );
}

export function resolvePersistedJoinState(
  options: ResolvePersistedJoinStateOptions
): PersistedJoinState {
  const {
    file,
    duckDataset,
    selectedBasemapId,
    linkedGeoColumn,
    selectedGpsColumns,
    isSelectedSourceFile = false
  } = options;

  const datasetGpsColumns = resolveDatasetGpsColumns(duckDataset);
  const resolvedGpsColumns = selectedGpsColumns ?? datasetGpsColumns;
  const nextState: PersistedJoinState = {
    joinedBasemap: file.joinedBasemap,
    geoColumn: file.geoColumn,
    gpsMode: file.gpsMode,
    gpsColumns: file.gpsColumns,
    joinCorrections:
      file.joinCorrections && Object.keys(file.joinCorrections).length > 0
        ? file.joinCorrections
        : undefined
  };

  if (duckDataset?.joinedBasemap) {
    nextState.joinedBasemap = duckDataset.joinedBasemap;
  }

  if (duckDataset?.geoColumn) {
    nextState.geoColumn = duckDataset.geoColumn;
  }

  if (duckDataset?.gpsMode) {
    nextState.gpsMode = true;
  }

  if (
    isSelectedSourceFile &&
    isOSMBasemapId(selectedBasemapId) &&
    resolvedGpsColumns
  ) {
    nextState.joinedBasemap = selectedBasemapId;
    nextState.gpsMode = true;
  }

  if (nextState.gpsMode) {
    nextState.gpsColumns = resolvedGpsColumns;
    nextState.geoColumn = undefined;
  }

  if (
    isSelectedSourceFile &&
    !nextState.gpsMode &&
    !nextState.geoColumn &&
    linkedGeoColumn
  ) {
    nextState.geoColumn = linkedGeoColumn;
  }

  if (
    isSelectedSourceFile &&
    !nextState.joinedBasemap &&
    isOSMBasemapId(selectedBasemapId) &&
    nextState.gpsMode
  ) {
    nextState.joinedBasemap = selectedBasemapId;
  }

  return nextState;
}
