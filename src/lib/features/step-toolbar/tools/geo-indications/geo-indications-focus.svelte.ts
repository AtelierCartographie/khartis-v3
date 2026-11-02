export type GeoIndicationSection = 'scale' | 'orientation' | 'inset';

let pendingSection = $state<GeoIndicationSection | null>(null);

export function requestGeoIndicationFocus(section: GeoIndicationSection): void {
  pendingSection = section;
}

export function getPendingGeoIndicationFocus(): GeoIndicationSection | null {
  return pendingSection;
}

export function clearGeoIndicationFocus(): void {
  pendingSection = null;
}
