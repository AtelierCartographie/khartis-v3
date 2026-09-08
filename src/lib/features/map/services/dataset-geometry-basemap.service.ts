import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import type { BasemapMetadata } from '../types/basemap.types';
import { basemapCatalogService } from './basemap-catalog.service.svelte';
import { basemapService } from './basemap.service.svelte';
import {
  createArrowTableFromDuckTable,
  createBasemapFromGeometryTable
} from './basemap-import.service';

interface DatasetGeometrySource {
  name: string;
  tableName: string;
  geometry?: { columnName?: string } | null;
  joinedBasemap?: string | null;
}

const derivedBasemaps = new Map<string, BasemapMetadata>();

export function isDatasetGeometryBasemap(basemapId: string | null): boolean {
  if (!basemapId) {
    return false;
  }
  return (
    basemapCatalogService.getBasemapById(basemapId)?.isDatasetGeometry === true
  );
}

export function forgetDatasetGeometryBasemap(tableName: string): void {
  derivedBasemaps.delete(tableName);
}

// Derived basemaps are keyed by DuckDB table name, which a new project reuses.
export function resetDatasetGeometryBasemaps(): void {
  derivedBasemaps.clear();
}

/**
 * Derives the helper layers of a dataset that carries its own geometry and
 * exposes them the way an imported basemap does, so the customize-basemap step
 * offers the same territory/limits layers on both import paths.
 */
export async function ensureDatasetGeometryBasemap(
  dataset: DatasetGeometrySource
): Promise<void> {
  if (!dataset.geometry || dataset.joinedBasemap || !dataset.tableName) {
    return;
  }

  try {
    const cached = derivedBasemaps.get(dataset.tableName);
    const basemap =
      cached ??
      (
        await createBasemapFromGeometryTable(Duck, dataset.tableName, {
          title: dataset.name,
          geometryColumn: dataset.geometry.columnName ?? undefined
        })
      ).basemap;

    derivedBasemaps.set(dataset.tableName, basemap);
    basemapCatalogService.addCustomBasemap(basemap);

    await activateDatasetGeometryBasemap(dataset.tableName);
  } catch (error) {
    logger.error(
      'Failed to derive basemap layers from dataset geometry',
      LogCategory.MAP,
      error,
      { extra: { tableName: dataset.tableName } }
    );
  }
}

/**
 * Puts a derived dataset basemap back in the reference slot, unless the user
 * picked a real reference basemap in the meantime.
 */
export async function activateDatasetGeometryBasemap(
  tableName?: string
): Promise<boolean> {
  const targetTable =
    tableName ??
    (derivedBasemaps.size === 1 ? [...derivedBasemaps.keys()][0] : undefined);
  if (!targetTable) {
    return false;
  }

  const basemap = derivedBasemaps.get(targetTable);
  if (!basemap) {
    return false;
  }

  const referenceBasemapId = basemapStyleStore.referenceBasemapId;
  const slotIsFree =
    referenceBasemapId === null ||
    referenceBasemapId === targetTable ||
    isDatasetGeometryBasemap(referenceBasemapId);

  if (!slotIsFree) {
    return false;
  }

  const geometryTable = await createArrowTableFromDuckTable(Duck, targetTable);
  await basemapService.registerCustomBasemap(basemap, geometryTable);
  basemapStyleStore.setReferenceBasemap(basemap.file);
  return true;
}
