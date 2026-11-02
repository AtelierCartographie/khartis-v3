import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type {
  ProjectionSuggestion,
  ProjectionSuggestionResult
} from './projection-suggest.service';

type NativeCrsSource = Pick<
  BasemapMetadata,
  'isCustom' | 'proj_source' | 'proj_to'
>;

/**
 * EPSG code of an imported basemap drawn in its own CRS (identity), the only
 * case where the rendered projection is the file's.
 */
export function getNativeCrsEpsg(
  metadata: NativeCrsSource | null | undefined
): string | undefined {
  if (!metadata?.isCustom || metadata.proj_to?.type !== 'identity') {
    return undefined;
  }
  return metadata.proj_source?.trim().match(/^EPSG:(\d+)$/i)?.[1];
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
