import type { BasemapMetadata } from '../types/basemap.types';
import { getBasemapValidYears } from './basemap-validity.utils';

const TITLE_SEPARATOR = ' — ';

/** "France" for "France — Ain": the area part of the title. */
export function getBasemapAreaLabel(
  basemap: BasemapMetadata,
  locale: string
): string {
  const title = locale === 'fr' ? basemap.title_fr : basemap.title_en;
  return title.split(TITLE_SEPARATOR)[0];
}

export function getBasemapLevelLabel(
  basemap: BasemapMetadata,
  locale: string
): string {
  return (
    (locale === 'fr' ? basemap.subtitle_fr : basemap.subtitle_en) ??
    getBasemapAreaLabel(basemap, locale)
  );
}

export interface FacetOption<T extends string = string> {
  id: T;
  label: string;
  count: number;
  /** Largest entity count among the basemaps, to order levels coarse to fine. */
  maxEntities: number;
}

/**
 * Counts basemaps per facet value, keeping the first label seen for each.
 * Basemaps without the facet (custom imports, `catalog` missing) are skipped.
 */
export function countFacet<T extends string>(
  basemaps: BasemapMetadata[],
  getValue: (basemap: BasemapMetadata) => T | undefined,
  getLabel: (basemap: BasemapMetadata, value: T) => string
): FacetOption<T>[] {
  const options = new Map<T, FacetOption<T>>();
  for (const basemap of basemaps) {
    const value = getValue(basemap);
    if (value === undefined) continue;
    const option = options.get(value);
    const entities = basemap.entity_count ?? 0;
    if (option) {
      option.count++;
      option.maxEntities = Math.max(option.maxEntities, entities);
    } else {
      options.set(value, {
        id: value,
        label: getLabel(basemap, value),
        count: 1,
        maxEntities: entities
      });
    }
  }
  return Array.from(options.values());
}

/** Years each basemap is valid for, most recent first. */
export function countYears(basemaps: BasemapMetadata[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const basemap of basemaps) {
    for (const year of getBasemapValidYears(basemap)) {
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([year, count]) => ({
    id: year,
    label: year,
    count,
    maxEntities: 0
  })).sort((a, b) => b.id.localeCompare(a.id));
}
