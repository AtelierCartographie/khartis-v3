import {
  MAP_PROJECTION_TYPE,
  type MapProjectionTypeValue
} from '$lib/features/commons/constants';
import type { BasemapZone } from '$lib/features/map/constants/basemap-styles';

export function isGlobeProjectionDisabled(zone: BasemapZone | null): boolean {
  return zone === 'france';
}

export function isGlobeProjectionAvailable(zone: BasemapZone | null): boolean {
  return !isGlobeProjectionDisabled(zone);
}

export function resolveProjectionForBasemapZone(
  projection: MapProjectionTypeValue,
  zone: BasemapZone | null
): MapProjectionTypeValue {
  return isGlobeProjectionDisabled(zone)
    ? MAP_PROJECTION_TYPE.MERCATOR
    : projection;
}
