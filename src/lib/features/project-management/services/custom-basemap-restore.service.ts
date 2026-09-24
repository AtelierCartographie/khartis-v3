import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import {
  basemapCatalogService,
  basemapService,
  isImportedCustomBasemap,
  processBasemapImport
} from '$lib/features/map/services';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { createFileFromAssetRef } from './asset-store.service';

async function duckTableExists(tableName: string): Promise<boolean> {
  const rows = (await Duck.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapeSqlString(tableName)}'`,
    { format: 'array' }
  )) as unknown[];
  return rows.length > 0;
}

async function replayCustomBasemap(basemap: BasemapMetadata): Promise<void> {
  if (!basemap.sourceAsset) {
    throw new Error(`Custom basemap has no source asset: ${basemap.file}`);
  }

  const sourceFile = await createFileFromAssetRef(basemap.sourceAsset);
  const { geometryTable } = await processBasemapImport(sourceFile, {
    tableName: basemap.file
  });

  // The map may already have asked for this reference basemap and failed while
  // its table was missing; registering it is what makes the map retry.
  if (basemapStyleStore.referenceBasemapId === basemap.file) {
    await basemapService.registerCustomBasemap(basemap, geometryTable);
  }
}

function getBasemapTitle(basemap: BasemapMetadata): string {
  return getLocale() === 'fr' ? basemap.title_fr : basemap.title_en;
}

export async function restoreCustomBasemapTables(): Promise<void> {
  const unrestoredTitles: string[] = [];

  for (const basemap of basemapCatalogService.basemaps.filter(
    isImportedCustomBasemap
  )) {
    try {
      if (await duckTableExists(basemap.file)) {
        continue;
      }
      await replayCustomBasemap(basemap);
    } catch (error) {
      logger.error('Failed to restore custom basemap', LogCategory.PROJECT, {
        basemap: basemap.file,
        hasSourceAsset: Boolean(basemap.sourceAsset),
        error
      });
      unrestoredTitles.push(getBasemapTitle(basemap));
    }
  }

  if (unrestoredTitles.length > 0) {
    showWarning(
      m.custom_basemap_restore_warning_title(),
      m.custom_basemap_restore_warning_message({
        names: new Intl.ListFormat(getLocale(), {
          type: 'conjunction'
        }).format(unrestoredTitles)
      })
    );
  }
}
