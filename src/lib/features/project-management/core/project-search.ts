import type { SerializedProject } from '$lib/types/serialization.types';

/** Bumped when the indexed fields change, so stored texts get rebuilt. */
export const PROJECT_SEARCH_VERSION = 2;

export interface ProjectSearchIndex {
  version: number;
  text: string;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Older snapshots may lack a section or hold another shape there. */
function list<T>(value: readonly T[] | undefined): readonly (T | undefined)[] {
  return Array.isArray(value) ? value : [];
}

function strings(values: readonly unknown[]): string[] {
  return values.filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
}

/**
 * Words a person remembers a map by: its texts (title, sources, credits,
 * legend titles), visualization names, imported file names and basemaps.
 * Column names and data values stay out.
 */
export function buildProjectSearchText(
  project: SerializedProject,
  basemapTitles: (basemapId: string) => readonly string[] = () => []
): string {
  const data = project.data;
  const referenceBasemapId = data?.basemapSettings?.referenceBasemapId;

  const terms = strings([
    ...list(data?.layoutSettings?.annotations?.items).map(
      (item) => item?.content
    ),
    ...list(data?.layoutSettings?.legend?.items).map((item) => item?.title),
    ...list(data?.visualizationSettings?.visualizations).map(
      (visualization) => visualization?.name
    ),
    ...list(data?.sourceFiles).map((file) => file?.name),
    ...list(data?.customBasemaps?.metadata).flatMap((basemap) => [
      basemap?.title_fr,
      basemap?.title_en
    ]),
    ...(typeof referenceBasemapId === 'string'
      ? basemapTitles(referenceBasemapId)
      : [])
  ]);

  return normalizeSearchText([...new Set(terms)].join(' \n '));
}

/** Every word of the query must appear, ignoring case and accents. */
export function matchesProjectSearch(
  haystack: readonly (string | undefined)[],
  query: string
): boolean {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return true;
  }

  const text = normalizeSearchText(haystack.filter(Boolean).join(' \n '));
  return words.every((word) => text.includes(word));
}
