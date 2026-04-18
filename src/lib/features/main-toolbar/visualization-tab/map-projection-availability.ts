import {
  MAP_PROJECTION_TYPE,
  type MapProjectionTypeValue
} from '$lib/features/commons/constants';
import type { BasemapZone } from '$lib/features/map/constants/basemap-styles';

export type GlobeProjectionDisableReason =
  | 'france-zone'
  | 'custom-reference-basemap';

export function isCustomReferenceBasemap(
  referenceBasemapId: string | null | undefined
): boolean {
  return /^custom_basemap_/i.test(referenceBasemapId ?? '');
}

export function resolveGlobeProjectionDisableReason(
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): GlobeProjectionDisableReason | null {
  if (isCustomReferenceBasemap(referenceBasemapId)) {
    return 'custom-reference-basemap';
  }

  if (zone === 'france') {
    return 'france-zone';
  }

  return null;
}

export function isGlobeProjectionDisabled(
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): boolean {
  return resolveGlobeProjectionDisableReason(zone, referenceBasemapId) !== null;
}

export function isGlobeProjectionAvailable(
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): boolean {
  return !isGlobeProjectionDisabled(zone, referenceBasemapId);
}

export function resolveProjectionForBasemapZone(
  projection: MapProjectionTypeValue,
  zone: BasemapZone | null,
  referenceBasemapId?: string | null
): MapProjectionTypeValue {
  if (!isGlobeProjectionDisabled(zone, referenceBasemapId)) {
    return projection;
  }
  return projection === MAP_PROJECTION_TYPE.GLOBE
    ? MAP_PROJECTION_TYPE.MERCATOR
    : projection;
}
