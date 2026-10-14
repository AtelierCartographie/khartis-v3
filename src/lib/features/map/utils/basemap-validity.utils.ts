import type { BasemapMetadata } from '../types/basemap.types';

/**
 * Validity period of a catalog basemap.
 *
 * A basemap whose geography did not change over several vintages (French
 * regions since 2017, a department whose communes did not change…) is published
 * once, with `valid_from` / `valid_to` (years, inclusive) next to `date` (the
 * vintage of its geometry). Basemaps without these fields are valid for their
 * `date` only.
 */
export interface BasemapValidityPeriod {
  from: number;
  to: number;
}

function parseYear(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const year = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isFinite(year) ? year : null;
}

export function getBasemapValidityPeriod(
  basemap: Pick<BasemapMetadata, 'date' | 'valid_from' | 'valid_to'>
): BasemapValidityPeriod | null {
  const dateYear = parseYear(basemap.date);
  const from = parseYear(basemap.valid_from) ?? dateYear;
  const to = parseYear(basemap.valid_to) ?? dateYear;
  if (from === null || to === null) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Label shown to users: "2017–2026" for a period, the plain `date` otherwise. */
export function formatBasemapValidity(
  basemap: Pick<BasemapMetadata, 'date' | 'valid_from' | 'valid_to'>
): string {
  const period = getBasemapValidityPeriod(basemap);
  if (!period || period.from === period.to) return basemap.date;
  return `${period.from}–${period.to}`;
}

/** Years (as strings, like `date`) for which the basemap is valid. */
export function getBasemapValidYears(
  basemap: Pick<BasemapMetadata, 'date' | 'valid_from' | 'valid_to'>
): string[] {
  const period = getBasemapValidityPeriod(basemap);
  if (!period) return [basemap.date];
  const years: string[] = [];
  for (let year = period.from; year <= period.to; year++) {
    years.push(String(year));
  }
  return years;
}

export function isBasemapValidForYear(
  basemap: Pick<BasemapMetadata, 'date' | 'valid_from' | 'valid_to'>,
  year: string
): boolean {
  const period = getBasemapValidityPeriod(basemap);
  const target = parseYear(year);
  if (!period || target === null) return basemap.date === year;
  return target >= period.from && target <= period.to;
}

/** Most recent year the basemap is valid for (used for sorting and recency). */
export function getBasemapLatestValidYear(
  basemap: Pick<BasemapMetadata, 'date' | 'valid_from' | 'valid_to'>
): number | null {
  return getBasemapValidityPeriod(basemap)?.to ?? null;
}
