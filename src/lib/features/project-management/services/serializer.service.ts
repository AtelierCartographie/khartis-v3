import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { resolvePersistedJoinState } from '$lib/features/commons/utils/persisted-join-state.utils';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
import { basemapCatalogService } from '$lib/features/map/services';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type {
  SerializedBasemapAttribute,
  SerializedProject,
  SerializedProjectData,
  SerializedUiSettings,
  SerializedUploadedFile
} from '$lib/types/serialization.types';
import type { KhartisProject } from '../types';
import {
  serializeUploadedFile,
  deserializeUploadedFile
} from '../core/file-serializer';
import { persistenceRegistry } from '../core/persistence-registry';
import { dataTabState } from '$lib/features/commons/stores/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { deepCloneForStorage } from '$lib/features/commons/utils/clone-for-storage.utils';

export type { FileSerializationOptions } from '../core/file-serializer';
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
    logger.error(
      `Failed to initialize DuckDB before ${operation}`,
      LogCategory.PERSISTENCE,
      error
    );
    return false;
  }

  if (!Duck) {
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
    data: serializedData
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

function mapRegistryToSerializedFormat(
  stores: Record<string, unknown>
): Pick<
  SerializedProjectData,
  | 'basemapSettings'
  | 'visualizationSettings'
  | 'layoutSettings'
  | 'uiSettings'
  | 'layerOrder'
> {
  const uiSettingsKeys = [
    'globalUi',
    'zoomMode',
    'dataTab',
    'dataWorkflow',
    'dataTools',
    'datasetsView',
    'tableFilters',
    'colorBlindness',
    'facets',
    'search',
    'simplification'
  ] as const;

  const uiSettings = Object.fromEntries(
    uiSettingsKeys.flatMap((key) =>
      stores[key] !== undefined ? [[key, stores[key]]] : []
    )
  ) as SerializedUiSettings;

  return {
    basemapSettings: {
      layers: stores.basemapLayers,
      auxLayers: stores.basemapAuxLayers,
      style: (stores.basemapStyle as { style?: unknown })?.style,
      lastSelectedTiledStyle: (
        stores.basemapStyle as { lastSelectedTiledStyle?: BasemapStyle | null }
      )?.lastSelectedTiledStyle,
      referenceBasemapId: (
        stores.basemapStyle as { referenceBasemapId?: string | null }
      )?.referenceBasemapId,
      showLabels: (stores.basemapStyle as { showLabels?: boolean })?.showLabels,
      groupVisibility: (
        stores.basemapStyle as { groupVisibility?: Record<string, boolean> }
      )?.groupVisibility,
      mapProjection: stores.mapProjection,
      mapViewState: stores.mapViewState,
      osmBasemap: stores.osmBasemap
    } as SerializedProjectData['basemapSettings'],
    visualizationSettings:
      stores.visualization as SerializedProjectData['visualizationSettings'],
    layoutSettings: {
      format: stores.format,
      annotations: stores.annotations,
      legend: stores.legend,
      geoIndications: stores.geoIndications,
      projection: stores.projection
    } as SerializedProjectData['layoutSettings'],
    uiSettings: Object.keys(uiSettings).length > 0 ? uiSettings : undefined,
    layerOrder: Array.isArray(stores.layerOrder)
      ? (stores.layerOrder as string[])
      : undefined
  };
}

function mapSerializedFormatToRegistry(
  data: SerializedProjectData
): Record<string, unknown> {
  const stores: Record<string, unknown> = {};

  if (data.basemapSettings) {
    stores.basemapLayers = data.basemapSettings.layers;
    if (data.basemapSettings.auxLayers !== undefined) {
      stores.basemapAuxLayers = data.basemapSettings.auxLayers;
    }
    stores.basemapStyle = {
      style: data.basemapSettings.style,
      lastSelectedTiledStyle: data.basemapSettings.lastSelectedTiledStyle,
      referenceBasemapId: data.basemapSettings.referenceBasemapId,
      showLabels: data.basemapSettings.showLabels,
      groupVisibility: data.basemapSettings.groupVisibility
    };
    stores.mapProjection = data.basemapSettings.mapProjection;
    if (data.basemapSettings.mapViewState) {
      stores.mapViewState = data.basemapSettings.mapViewState;
    }
    if (data.basemapSettings.osmBasemap !== undefined) {
      stores.osmBasemap = data.basemapSettings.osmBasemap;
    }
  }

  if (data.visualizationSettings) {
    stores.visualization = data.visualizationSettings;
  }

  if (data.layerOrder !== undefined) {
    stores.layerOrder = data.layerOrder;
  }

  if (data.layoutSettings) {
    const ls = data.layoutSettings;
    if (ls.format) stores.format = ls.format;
    if (ls.annotations) stores.annotations = ls.annotations;
    if (ls.legend) stores.legend = ls.legend;
    if (ls.geoIndications) stores.geoIndications = ls.geoIndications;
    if (ls.projection) stores.projection = ls.projection;
  }

  if (data.uiSettings) {
    Object.assign(stores, data.uiSettings);
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

  if (dataObj.sourceFiles && Array.isArray(dataObj.sourceFiles)) {
    const selectedSourceFileId = datasetsStore.selectedDataset?.sourceFileId;
    const selectedBasemapId = dataTabState.basemapJoin.selectedBasemap;
    const selectedGpsColumns =
      dataTabState.geolocation.latitudeColumn &&
      dataTabState.geolocation.longitudeColumn
        ? {
            lat: dataTabState.geolocation.latitudeColumn,
            lon: dataTabState.geolocation.longitudeColumn
          }
        : undefined;

    serialized.sourceFiles = dataObj.sourceFiles.map((file: UploadedFile) => {
      const serializedFile = serializeUploadedFile(file, {
        preserveBinary: options?.preserveBinary
      });

      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(file.id);
      Object.assign(
        serializedFile,
        resolvePersistedJoinState({
          file,
          duckDataset: duckDBDataset,
          selectedBasemapId,
          linkedGeoColumn: dataTabState.geolocation.linkedVariableName,
          selectedGpsColumns,
          isSelectedSourceFile: file.id === selectedSourceFileId
        })
      );

      const storeDataset = datasetsStore.datasets.find(
        (d) => d.sourceFileId === file.id
      );
      if (storeDataset) {
        serializedFile.datasetId = storeDataset.id;
      }

      return serializedFile;
    });
  }

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
      logger.error(
        'Failed to serialize custom basemap attributes',
        LogCategory.PROJECT,
        error
      );
    }
  }

  const storeData = persistenceRegistry.serializeAll();
  Object.assign(serialized, mapRegistryToSerializedFormat(storeData));

  return serialized;
}

export async function deserializeProjectData(
  data: SerializedProjectData
): Promise<unknown> {
  if (!data) return data;

  const deserialized = { ...data };

  if (data.sourceFiles && Array.isArray(data.sourceFiles)) {
    deserialized.sourceFiles = data.sourceFiles.map(
      (file: SerializedUploadedFile) => deserializeUploadedFile(file)
    ) as SerializedUploadedFile[];
  }

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
      logger.error(
        'Failed to restore custom basemap attributes',
        LogCategory.PROJECT,
        error
      );
    }
  }

  await persistenceRegistry.withPersistenceSuspended(() => {
    persistenceRegistry.resetAll();
    const storeData = mapSerializedFormatToRegistry(data);
    persistenceRegistry.deserializeAll(storeData);
  });

  return deserialized;
}

export async function prepareForIndexedDB(
  project: KhartisProject
): Promise<SerializedProject> {
  const serialized = await serialize(project, { preserveBinary: true });
  return deepCloneForStorage(serialized) as SerializedProject;
}
