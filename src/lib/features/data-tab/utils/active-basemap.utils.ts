import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import { isOSMBasemapFileId } from '$lib/features/map/services/osm-tile.service';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

export type ActiveBasemapOrigin = 'catalog' | 'import' | 'osm';

export function resolveActiveBasemapOrigin(
  basemap: Pick<BasemapMetadata, 'file' | 'isCustom'>
): ActiveBasemapOrigin {
  if (isOSMBasemapFileId(basemap.file)) return 'osm';
  if (basemap.isCustom) return 'import';
  return 'catalog';
}

export function getBasemapOriginSource(
  origin: ActiveBasemapOrigin
): BasemapSource {
  switch (origin) {
    case 'osm':
      return BasemapSource.OSM;
    case 'import':
      return BasemapSource.IMPORT;
    case 'catalog':
    default:
      return BasemapSource.CATALOG;
  }
}
