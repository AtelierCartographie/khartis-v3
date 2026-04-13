import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

const OSM_BASEMAP_PREFIX = 'osm_';

export interface PersistedProjectBasemap {
  id: string;
  type: 'catalog' | 'custom' | 'osm';
  data?: unknown;
}

interface DatasetBasemapSelection {
  sourceFileId?: string;
}

interface SourceFileBasemapSelection {
  id: string;
  joinedBasemap?: string;
}

export function isPersistedBasemapMetadata(
  value: unknown
): value is BasemapMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.file === 'string' &&
    typeof candidate.title_fr === 'string' &&
    typeof candidate.title_en === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.proj_source === 'string' &&
    Array.isArray(candidate.bbox) &&
    candidate.bbox.length === 4 &&
    Array.isArray(candidate.layers)
  );
}

export function resolveBasemapSource(
  type: PersistedProjectBasemap['type']
): BasemapSource {
  switch (type) {
    case 'custom':
      return BasemapSource.IMPORT;
    case 'osm':
      return BasemapSource.OSM;
    case 'catalog':
    default:
      return BasemapSource.CATALOG;
  }
}

function isOSMBasemapId(basemapId: string): boolean {
  return basemapId.startsWith(OSM_BASEMAP_PREFIX);
}

function resolvePersistedBasemapType(
  basemapId: string,
  basemapSource?: BasemapSource,
  projectBasemap?: PersistedProjectBasemap | null
): PersistedProjectBasemap['type'] {
  if (projectBasemap?.id === basemapId) {
    return projectBasemap.type;
  }

  if (basemapSource === BasemapSource.OSM || isOSMBasemapId(basemapId)) {
    return 'osm';
  }

  const existingBasemap = basemapCatalogService.getBasemapById(basemapId);
  if (basemapSource === BasemapSource.IMPORT || existingBasemap?.isCustom) {
    return 'custom';
  }

  return 'catalog';
}

function resolvePersistedBasemapData(
  basemapId: string,
  basemapType: PersistedProjectBasemap['type'],
  projectBasemap?: PersistedProjectBasemap | null
): unknown {
  if (projectBasemap?.id === basemapId && projectBasemap.data !== undefined) {
    return projectBasemap.data;
  }

  if (basemapType === 'catalog') {
    return undefined;
  }

  return basemapCatalogService.getBasemapById(basemapId) ?? undefined;
}

function createPersistedBasemapSelection(
  basemapId: string,
  options: {
    basemapSource?: BasemapSource;
    projectBasemap?: PersistedProjectBasemap | null;
  } = {}
): PersistedProjectBasemap {
  const type = resolvePersistedBasemapType(
    basemapId,
    options.basemapSource,
    options.projectBasemap
  );
  const data = resolvePersistedBasemapData(
    basemapId,
    type,
    options.projectBasemap
  );

  return data === undefined
    ? { id: basemapId, type }
    : { id: basemapId, type, data };
}

export function resolveRelevantPersistedBasemap(input: {
  selectedDataset?: DatasetBasemapSelection | null;
  sourceFiles?: SourceFileBasemapSelection[] | null;
  projectBasemap?: PersistedProjectBasemap | null;
  selectedBasemapId?: string | null;
  selectedBasemapSource?: BasemapSource;
  hasMultipleDatasets?: boolean;
}): PersistedProjectBasemap | undefined {
  const selectedSourceFileId = input.selectedDataset?.sourceFileId?.trim();
  const selectedSourceFile = selectedSourceFileId
    ? input.sourceFiles?.find((file) => file.id === selectedSourceFileId)
    : undefined;
  const sourceFileBasemapId = selectedSourceFile?.joinedBasemap?.trim();

  if (sourceFileBasemapId) {
    return createPersistedBasemapSelection(sourceFileBasemapId, {
      projectBasemap: input.projectBasemap
    });
  }

  const selectedBasemapId = input.selectedBasemapId?.trim();
  if (selectedBasemapId) {
    return createPersistedBasemapSelection(selectedBasemapId, {
      basemapSource: input.selectedBasemapSource,
      projectBasemap: input.projectBasemap
    });
  }

  if (!input.hasMultipleDatasets && input.projectBasemap?.id) {
    return input.projectBasemap;
  }

  return undefined;
}

export async function restorePersistedBasemapSelection(
  savedBasemap: PersistedProjectBasemap | null | undefined
): Promise<void> {
  if (!savedBasemap?.id) {
    return;
  }

  const basemapSource = resolveBasemapSource(savedBasemap.type);
  dataTabActions.setBasemapJoinState({
    selectedBasemap: savedBasemap.id,
    basemapSource
  });
  basemapStyleStore.setReferenceBasemap(
    savedBasemap.type === 'osm' ? null : savedBasemap.id
  );

  if (
    (savedBasemap.type === 'custom' || savedBasemap.type === 'osm') &&
    isPersistedBasemapMetadata(savedBasemap.data)
  ) {
    const basemapData = savedBasemap.data;

    if (!basemapCatalogService.getBasemapById(savedBasemap.id)) {
      basemapCatalogService.addCustomBasemap(basemapData);
    }

    if (savedBasemap.type === 'custom') {
      basemapService.registerCustomBasemapMetadata(basemapData);
      osmBasemapStore.clear();
      return;
    }

    osmBasemapStore.setOSMBasemap(basemapData);
    return;
  }

  if (savedBasemap.type !== 'osm') {
    osmBasemapStore.clear();
  }
}
