import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { dataTabState } from '$lib/features/commons/store/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { deepCloneForStorage } from '$lib/features/commons/utils/clone-for-storage.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { basemapCatalogService } from '$lib/features/map/services';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type {
  SerializedBasemapAttribute,
  SerializedProject,
  SerializedProjectData,
  SerializedUploadedFile
} from '$lib/types/serialization.types';
import type { KhartisProject } from '../types';
import {
  serializeUploadedFile,
  deserializeUploadedFile
} from './file-serializer';
import { persistenceRegistry } from './persistence-registry';

export type { FileSerializationOptions } from './file-serializer';
export { serializeUploadedFile, deserializeUploadedFile };

interface SerializeOptions {
  preserveBinary?: boolean;
}

function toSafeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toSafeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function isValidBasemapMetadata(value: unknown): value is BasemapMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  // Accept both new format (title_fr, proj_source) and old .kh files (title, projection)
  const hasTitle =
    typeof candidate.title_fr === 'string' ||
    typeof candidate.title === 'string';
  const hasProjection =
    typeof candidate.proj_source === 'string' ||
    typeof candidate.projection === 'string';

  return (
    typeof candidate.file === 'string' &&
    (candidate.file as string).length > 0 &&
    hasTitle &&
    typeof candidate.source === 'string' &&
    typeof candidate.date === 'string' &&
    hasProjection &&
    Array.isArray(candidate.layers) &&
    Array.isArray(candidate.bbox) &&
    (candidate.bbox as unknown[]).length === 4
  );
}

async function ensureDuckDbReady(operation: string): Promise<boolean> {
  try {
    await duckDBOrchestrator.waitForInitialization();
  } catch (error) {
    logger.debug(
      `DuckDB initialization failed while ${operation}`,
      LogCategory.PROJECT,
      error
    );
    return false;
  }

  if (!Duck) {
    logger.warn(`DuckDB unavailable while ${operation}`, LogCategory.PROJECT);
    return false;
  }

  return true;
}

export async function serialize(
  project: KhartisProject,
  options?: SerializeOptions
): Promise<SerializedProject> {
  const serializedData = project.data
    ? await serializeProjectData(project.data, options)
    : undefined;

  return {
    ...project,
    manifest: {
      ...project.manifest,
      createdAt:
        project.manifest.createdAt instanceof Date
          ? project.manifest.createdAt.toISOString()
          : project.manifest.createdAt,
      updatedAt:
        project.manifest.updatedAt instanceof Date
          ? project.manifest.updatedAt.toISOString()
          : project.manifest.updatedAt
    },
    data: serializedData,
    visualization: project.visualization,
    layout: project.layout,
    resources: project.resources
  };
}

export async function deserialize(
  data: SerializedProject
): Promise<KhartisProject> {
  const deserializedData = data.data
    ? ((await deserializeProjectData(data.data)) as KhartisProject['data'])
    : undefined;

  const project: KhartisProject = {
    ...data,
    manifest: {
      ...data.manifest,
      createdAt: new Date(data.manifest.createdAt),
      updatedAt: new Date(data.manifest.updatedAt)
    } as KhartisProject['manifest'],
    data: deserializedData
  } as KhartisProject;

  return project;
}

/**
 * Maps registry store data to the serialized format structure.
 * Maintains backward compatibility with old project files.
 */
function mapRegistryToSerializedFormat(
  stores: Record<string, unknown>
): Pick<
  SerializedProjectData,
  'basemapSettings' | 'visualizationSettings' | 'layoutSettings'
> {
  return {
    basemapSettings: {
      layers: stores.basemapLayers,
      style: (stores.basemapStyle as { style?: unknown })?.style,
      referenceBasemapId: (
        stores.basemapStyle as { referenceBasemapId?: string | null }
      )?.referenceBasemapId,
      mapProjection: stores.mapProjection,
      mapViewState: stores.mapViewState
    } as SerializedProjectData['basemapSettings'],
    visualizationSettings:
      stores.visualization as SerializedProjectData['visualizationSettings'],
    layoutSettings: {
      format: stores.format,
      annotations: stores.annotations,
      legend: stores.legend,
      geoIndications: stores.geoIndications,
      projection: stores.projection
    } as SerializedProjectData['layoutSettings']
  };
}

/**
 * Maps the old serialized format back to flat registry keys for deserialization.
 * Handles both old projects (basemapSettings/layoutSettings) and future flat format.
 */
function mapSerializedFormatToRegistry(
  data: SerializedProjectData
): Record<string, unknown> {
  const stores: Record<string, unknown> = {};

  if (data.basemapSettings) {
    stores.basemapLayers = data.basemapSettings.layers;
    stores.basemapStyle = {
      style: data.basemapSettings.style,
      referenceBasemapId: data.basemapSettings.referenceBasemapId
    };
    stores.mapProjection = data.basemapSettings.mapProjection;
    if (data.basemapSettings.mapViewState) {
      stores.mapViewState = data.basemapSettings.mapViewState;
    }
  }

  if (data.visualizationSettings) {
    stores.visualization = data.visualizationSettings;
  }

  if (data.layoutSettings) {
    const ls = data.layoutSettings;
    if (ls.format) stores.format = ls.format;
    if (ls.annotations) stores.annotations = ls.annotations;
    if (ls.legend) stores.legend = ls.legend;
    if (ls.geoIndications) stores.geoIndications = ls.geoIndications;
    if (ls.projection) stores.projection = ls.projection;
  }

  return stores;
}

export async function serializeProjectData(
  data: unknown,
  options?: SerializeOptions
): Promise<SerializedProjectData | undefined> {
  if (!data) return undefined;
  if (typeof data !== 'object' || data === null) return undefined;

  const serialized = { ...data } as SerializedProjectData;
  const dataObj = data as Record<string, unknown>;

  // --- File serialization (data-layer, kept as-is) ---

  if (dataObj.sourceFiles && Array.isArray(dataObj.sourceFiles)) {
    serialized.sourceFiles = dataObj.sourceFiles.map((file: UploadedFile) => {
      const serializedFile = serializeUploadedFile(file, {
        preserveBinary: options?.preserveBinary
      });

      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(file.id);
      if (duckDBDataset) {
        if (duckDBDataset.joinedBasemap) {
          serializedFile.joinedBasemap = duckDBDataset.joinedBasemap;
        }
        if (duckDBDataset.geoColumn) {
          serializedFile.geoColumn = duckDBDataset.geoColumn;
        }
        if (duckDBDataset.gpsMode) {
          serializedFile.gpsMode = duckDBDataset.gpsMode;
        }
        if (duckDBDataset.gpsColumns) {
          serializedFile.gpsColumns = duckDBDataset.gpsColumns;
        }
      }

      // Fallback: persist geo column & basemap from UI state when DuckDB
      // dataset doesn't have them yet (user selected but hasn't clicked Visualiser)
      if (!serializedFile.geoColumn && dataTabState.geolocation.linkedVariableName) {
        serializedFile.geoColumn = dataTabState.geolocation.linkedVariableName;
      }
      if (!serializedFile.joinedBasemap && dataTabState.basemapJoin.selectedBasemap) {
        serializedFile.joinedBasemap = dataTabState.basemapJoin.selectedBasemap;
      }

      const storeDataset = datasetsStore.datasets.find(
        (d) => d.sourceFileId === file.id
      );
      if (storeDataset) {
        serializedFile.datasetId = storeDataset.id;
      }

      return serializedFile;
    });
  }

  // --- Custom basemap DuckDB serialization (data-layer, kept as-is) ---

  const customBasemaps = basemapCatalogService.basemaps.filter(
    (b: BasemapMetadata) => b.isCustom
  );

  if (
    customBasemaps.length > 0 &&
    (await ensureDuckDbReady('serializing custom basemap attributes'))
  ) {
    try {
      const tableExists = await Duck.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'custom_basemap_attributes'`,
        { format: 'array' }
      );

      if (tableExists && Array.isArray(tableExists) && tableExists.length > 0) {
        const attributes = (await Duck.query(
          'SELECT * FROM custom_basemap_attributes',
          { format: 'array' }
        )) as SerializedBasemapAttribute[];

        serialized.customBasemaps = {
          metadata: customBasemaps,
          attributes: attributes || []
        };
      }
    } catch (error) {
      logger.debug(
        'Failed to serialize custom basemap attributes',
        LogCategory.PROJECT,
        error
      );
    }
  }

  // --- Store state: read from persistence registry ---

  const storeData = persistenceRegistry.serializeAll();
  Object.assign(serialized, mapRegistryToSerializedFormat(storeData));

  return serialized;
}

export async function deserializeProjectData(
  data: SerializedProjectData
): Promise<unknown> {
  if (!data) return data;

  const deserialized = { ...data };

  // --- File deserialization (data-layer, kept as-is) ---

  if (data.sourceFiles && Array.isArray(data.sourceFiles)) {
    deserialized.sourceFiles = data.sourceFiles.map(
      (file: SerializedUploadedFile) => deserializeUploadedFile(file)
    ) as SerializedUploadedFile[];
  }

  // --- Custom basemap DuckDB restoration (data-layer, kept as-is) ---

  if (
    data.customBasemaps &&
    (await ensureDuckDbReady('restoring custom basemaps'))
  ) {
    try {
      const { metadata, attributes } = data.customBasemaps;
      const validMetadata = Array.isArray(metadata)
        ? metadata.filter(isValidBasemapMetadata)
        : [];
      const validAttributes = Array.isArray(attributes)
        ? attributes
            .filter((attribute) => attribute && typeof attribute === 'object')
            .map((attribute) => {
              const candidate =
                attribute as Partial<SerializedBasemapAttribute>;
              return {
                raw: toSafeString(candidate.raw),
                id: toSafeString(candidate.id),
                variant: toSafeString(candidate.variant),
                normalized: toSafeString(candidate.normalized),
                basemap: toSafeString(candidate.basemap),
                basemap_count: toSafeInteger(candidate.basemap_count)
              };
            })
            .filter((attribute) => attribute.basemap.length > 0)
        : [];

      if (Array.isArray(metadata) && validMetadata.length !== metadata.length) {
        logger.debug(
          'Skipping invalid custom basemap metadata entries during restore',
          LogCategory.PROJECT,
          {
            total: metadata.length,
            restored: validMetadata.length
          }
        );
      }

      await Duck.query(`
        CREATE TABLE IF NOT EXISTS custom_basemap_attributes (
          raw VARCHAR,
          id VARCHAR,
          variant VARCHAR,
          normalized VARCHAR,
          basemap VARCHAR,
          basemap_count INTEGER
        )
      `);

      await Duck.query('DELETE FROM custom_basemap_attributes');

      if (validAttributes.length > 0) {
        const insertValues = validAttributes
          .map(
            (attr) =>
              `('${escapeSqlString(attr.raw)}', '${escapeSqlString(attr.id)}', '${escapeSqlString(attr.variant)}', '${escapeSqlString(attr.normalized)}', '${escapeSqlString(attr.basemap)}', ${attr.basemap_count})`
          )
          .join(',\n');

        await Duck.query(`
          INSERT INTO custom_basemap_attributes (raw, id, variant, normalized, basemap, basemap_count)
          VALUES ${insertValues}
        `);
      }

      validMetadata.forEach((basemap: BasemapMetadata) => {
        basemapCatalogService.addCustomBasemap(basemap);
      });
    } catch (error) {
      logger.debug(
        'Failed to restore custom basemaps',
        LogCategory.PROJECT,
        error
      );
    }
  }

  // --- Store state: restore via persistence registry ---

  const storeData = mapSerializedFormatToRegistry(data);
  persistenceRegistry.deserializeAll(storeData);

  return deserialized;
}

export async function prepareForIndexedDB(
  project: KhartisProject
): Promise<SerializedProject> {
  const serialized = await serialize(project, { preserveBinary: true });
  return deepCloneForStorage(serialized) as SerializedProject;
}
