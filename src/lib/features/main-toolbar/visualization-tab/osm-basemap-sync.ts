import { isOSMBasemap } from '$lib/features/map/services/osm-tile.service';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { PERSISTED_BASEMAP_TYPE } from '../data-tab/services/persisted-basemap';

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
  setOSMBasemap: (basemap: BasemapMetadata | null) => void;
  clear: () => void;
}

function isProjectOSMBasemapData(value: unknown): value is BasemapMetadata {
  return (
    !!value &&
    typeof value === 'object' &&
    'file' in value &&
    typeof value.file === 'string' &&
    value.file.startsWith('osm_') &&
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
    if (osmState.activeOSMBasemap) {
      osmState.clear();
    }
    return;
  }

  const existingBasemap = basemapLookup.getBasemapById(basemap.id);
  if (existingBasemap && isOSMBasemap(existingBasemap)) {
    if (osmState.activeOSMBasemap?.file !== existingBasemap.file) {
      osmState.setOSMBasemap(existingBasemap);
    }
    return;
  }

  if (isProjectOSMBasemapData(basemap.data)) {
    basemapLookup.addCustomBasemap(basemap.data);
    if (osmState.activeOSMBasemap?.file !== basemap.data.file) {
      osmState.setOSMBasemap(basemap.data);
    }
    return;
  }

  if (osmState.activeOSMBasemap) {
    osmState.clear();
  }
}
