import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { PERSISTED_BASEMAP_TYPE } from '$lib/features/data-tab/services/persisted-basemap.service';
import {
  isOSMBasemap,
  isOSMBasemapFileId
} from '$lib/features/map/services/osm-tile.service';

interface PersistedBasemapLike {
  id: string;
  type: string;
  data?: unknown;
}

interface BasemapLookup {
  getBasemapById: (id: string) => BasemapMetadata | null | undefined;
  addCustomBasemap: (basemap: BasemapMetadata) => void;
}

interface OSMBasemapState {
  activeOSMBasemap: BasemapMetadata | null;
  isDisabledByUser: boolean;
  setOSMBasemap: (basemap: BasemapMetadata | null) => void;
  clear: () => void;
}

function isProjectOSMBasemapData(value: unknown): value is BasemapMetadata {
  return (
    !!value &&
    typeof value === 'object' &&
    'file' in value &&
    typeof value.file === 'string' &&
    isOSMBasemapFileId(value.file) &&
    'source' in value &&
    typeof value.source === 'string' &&
    'date' in value &&
    typeof value.date === 'string' &&
    'proj_source' in value &&
    typeof value.proj_source === 'string' &&
    'bbox' in value &&
    Array.isArray(value.bbox) &&
    value.bbox.length === 4 &&
    'layers' in value &&
    Array.isArray(value.layers)
  );
}

export function syncProjectOSMBasemap(
  basemap: PersistedBasemapLike | undefined,
  basemapLookup: BasemapLookup,
  osmState: OSMBasemapState
): void {
  if (basemap?.type !== PERSISTED_BASEMAP_TYPE.OSM) {
    if (osmState.activeOSMBasemap || osmState.isDisabledByUser) {
      osmState.clear();
    }
    return;
  }

  const existingBasemap = basemapLookup.getBasemapById(basemap.id);
  const projectBasemap = isProjectOSMBasemapData(basemap.data)
    ? basemap.data
    : existingBasemap;

  if (isProjectOSMBasemapData(basemap.data) && !existingBasemap) {
    basemapLookup.addCustomBasemap(basemap.data);
  }

  if (osmState.isDisabledByUser) {
    return;
  }

  if (projectBasemap && isOSMBasemap(projectBasemap)) {
    if (osmState.activeOSMBasemap?.file !== projectBasemap.file) {
      osmState.setOSMBasemap(projectBasemap);
    }
    return;
  }

  if (osmState.activeOSMBasemap) {
    osmState.clear();
  }
}
