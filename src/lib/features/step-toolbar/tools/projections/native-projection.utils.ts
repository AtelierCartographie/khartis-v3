import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { isWgs84LikeCrs } from '$lib/features/map/utils/dataset-crs.utils';
import type {
  ProjectionSuggestion,
  ProjectionSuggestionResult
} from './projection-suggest.service';

type NativeCrsSource = Pick<
  BasemapMetadata,
  'isCustom' | 'proj_source' | 'proj_to'
>;

/**
 * CRS of an imported basemap drawn in its own coordinates (identity), the
 * only case where the rendered projection is the file's. An EPSG code, or the
 * PROJJSON DuckDB reads from a `.prj` that names no authority (Esri WKT).
 */
export function getNativeCrs(
  metadata: NativeCrsSource | null | undefined
): string | undefined {
  if (!metadata?.isCustom || metadata.proj_to?.type !== 'identity') {
    return undefined;
  }
  return readProjectedCrs(metadata.proj_source);
}

/** The CRS as given, unless it is missing or geographic WGS84. */
export function readProjectedCrs(
  crs: string | null | undefined
): string | undefined {
  const trimmed = crs?.trim();
  return trimmed && !isWgs84LikeCrs(trimmed) ? trimmed : undefined;
}

/** EPSG code of a CRS given as `EPSG:XXXX` or as a PROJJSON carrying its id. */
export function readCrsEpsg(crs: string | undefined): string | undefined {
  if (!crs) {
    return undefined;
  }
  const code = crs.match(/^EPSG:(\d+)$/i)?.[1];
  if (code || !crs.startsWith('{')) {
    return code;
  }
  try {
    const id = (
      JSON.parse(crs) as { id?: { authority?: unknown; code?: unknown } }
    ).id;
    return id?.authority === 'EPSG' &&
      (typeof id.code === 'number' || typeof id.code === 'string')
      ? String(id.code)
      : undefined;
  } catch {
    return undefined;
  }
}

export function getNativeCrsEpsg(
  metadata: NativeCrsSource | null | undefined
): string | undefined {
  return readCrsEpsg(getNativeCrs(metadata));
}

export function findNativeSuggestion(
  suggestions: ProjectionSuggestionResult | undefined,
  nativeEpsg: string | undefined
): ProjectionSuggestion | undefined {
  if (!suggestions || !nativeEpsg) {
    return undefined;
  }
  return [...suggestions.national, ...suggestions.generic].find(
    (suggestion) => suggestion.epsg === nativeEpsg
  );
}
