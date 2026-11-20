import { basemapCatalogService } from '$lib/features/map/services';
import type { SerializedProject } from '$lib/types/serialization.types';
import {
  buildProjectSearchText,
  PROJECT_SEARCH_VERSION,
  type ProjectSearchIndex
} from '../core/project-search';

/** The title alone is often a region ("France"); the subtitle says the level. */
function catalogBasemapTitles(basemapId: string): string[] {
  const basemap = basemapCatalogService.getBasemapById(basemapId);
  if (!basemap) {
    return [];
  }

  return [
    [basemap.title_fr, basemap.subtitle_fr],
    [basemap.title_en, basemap.subtitle_en]
  ].map((parts) => parts.filter(Boolean).join(' '));
}

/** Reads the catalog as loaded: a save never waits on the network for it. */
export function buildProjectSearchIndex(
  project: SerializedProject
): ProjectSearchIndex {
  return {
    version: PROJECT_SEARCH_VERSION,
    text: buildProjectSearchText(project, catalogBasemapTitles)
  };
}

/** Without the catalog, basemaps are left out of the index, nothing else. */
export async function loadSearchCatalog(): Promise<void> {
  await basemapCatalogService.loadCatalog().catch(() => undefined);
}
