import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { dataTabActions } from '$lib/features/commons/stores/data-tab.store.svelte';
import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

const OSM_BASEMAP_PREFIX = 'osm_';

export const PERSISTED_BASEMAP_TYPE = {
  CATALOG: 'catalog',
  CUSTOM: 'custom',
  OSM: 'osm'
} as const;

export type PersistedBasemapType =
  (typeof PERSISTED_BASEMAP_TYPE)[keyof typeof PERSISTED_BASEMAP_TYPE];

export interface PersistedProjectBasemap {
  id: string;
  type: PersistedBasemapType;
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
    case PERSISTED_BASEMAP_TYPE.CUSTOM:
      return BasemapSource.IMPORT;
    case PERSISTED_BASEMAP_TYPE.OSM:
      return BasemapSource.OSM;
    case PERSISTED_BASEMAP_TYPE.CATALOG:
    default:
      return BasemapSource.CATALOG;
  }
}

function isOSMBasemapId(basemapId: string): boolean {
  return basemapId.startsWith(OSM_BASEMAP_PREFIX);
}

function activateReferenceTiledStyle(): void {
  const referenceStyle =
    basemapStyleStore.lastSelectedTiledStyle ?? BasemapStyle.MONDE_COULEURS;
  basemapStyleStore.setStyle(referenceStyle);
  basemapStyleStore.requestViewportReset(referenceStyle);
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
    return PERSISTED_BASEMAP_TYPE.OSM;
  }

  const existingBasemap = basemapCatalogService.getBasemapById(basemapId);
  if (basemapSource === BasemapSource.IMPORT || existingBasemap?.isCustom) {
    return PERSISTED_BASEMAP_TYPE.CUSTOM;
  }

  return PERSISTED_BASEMAP_TYPE.CATALOG;
}

function resolvePersistedBasemapData(
  basemapId: string,
  basemapType: PersistedProjectBasemap['type'],
  projectBasemap?: PersistedProjectBasemap | null
): unknown {
  if (projectBasemap?.id === basemapId && projectBasemap.data !== undefined) {
    return projectBasemap.data;
  }

  if (basemapType === PERSISTED_BASEMAP_TYPE.CATALOG) {
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
  if (savedBasemap.type === PERSISTED_BASEMAP_TYPE.OSM) {
    basemapStyleStore.setReferenceBasemap(null);
    activateReferenceTiledStyle();
  } else {
    basemapStyleStore.setReferenceBasemap(savedBasemap.id);
  }

  if (
    (savedBasemap.type === PERSISTED_BASEMAP_TYPE.CUSTOM ||
      savedBasemap.type === PERSISTED_BASEMAP_TYPE.OSM) &&
    isPersistedBasemapMetadata(savedBasemap.data)
  ) {
    const basemapData = savedBasemap.data;

    if (!basemapCatalogService.getBasemapById(savedBasemap.id)) {
      basemapCatalogService.addCustomBasemap(basemapData);
    }

    if (savedBasemap.type === PERSISTED_BASEMAP_TYPE.CUSTOM) {
      basemapService.registerCustomBasemapMetadata(basemapData);
      osmBasemapStore.clear();
      return;
    }

    if (isOSMBasemapId(basemapData.file)) {
      osmBasemapStore.clear();
    } else {
      osmBasemapStore.setOSMBasemap(basemapData);
    }
    return;
  }

  osmBasemapStore.clear();
}
