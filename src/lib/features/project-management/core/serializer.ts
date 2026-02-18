import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import { deepCloneForStorage } from '$lib/features/commons/utils/clone-for-storage.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { Duck, duckDBOrchestrator } from '$lib/features/duckdb';
import { basemapCatalogService } from '$lib/features/map/services';
import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import {
  annotationsActions,
  getAnnotationsState
} from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import {
  formatActions,
  getFormatState
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import {
  geoIndicationsActions,
  geoIndicationsState
} from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.store.svelte';
import {
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import {
  getProjectionState,
  projectionActions
} from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';
import type {
  SerializedBasemapAttribute,
  SerializedLayoutSettings,
  SerializedProject,
  SerializedProjectData,
  SerializedUploadedFile,
  SerializedVisualizationSettings
} from '$lib/types/serialization.types';
import type { KhartisProject } from '../types';
import {
  serializeUploadedFile,
  deserializeUploadedFile
} from './file-serializer';
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

  const candidate = value as Partial<BasemapMetadata>;
  return (
    typeof candidate.file === 'string' &&
    candidate.file.length > 0 &&
    typeof candidate.title === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.projection === 'string' &&
    Array.isArray(candidate.layers) &&
    Array.isArray(candidate.bbox) &&
    candidate.bbox.length === 4
  );
}

async function ensureDuckDbReady(operation: string): Promise<boolean> {
  try {
    await duckDBOrchestrator.waitForInitialization();
  } catch (error) {
    logger.warn(
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

export async function serializeProjectData(
  data: unknown,
  options?: SerializeOptions
): Promise<SerializedProjectData | undefined> {
  if (!data) return undefined;
  if (typeof data !== 'object' || data === null) return undefined;

  const serialized = { ...data } as SerializedProjectData;
  const dataObj = data as Record<string, unknown>;

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
      logger.warn(
        'Failed to serialize custom basemap attributes',
        LogCategory.PROJECT,
        error
      );
    }
  }

  serialized.basemapSettings = {
    layers: basemapLayersStore.layers,
    style: basemapStyleStore.selectedStyle,
    mapProjection: mapProjectionStore.projection
  };

  const visualizations = visualizationStore.visualizations;
  if (visualizations.length > 0) {
    serialized.visualizationSettings = {
      visualizations,
      selectedVisualizationId: visualizationStore.selectedVisualization?.id,
      activeVisualizationIds: visualizationStore.activeVisualizations.map(
        (v) => v.id
      )
    } satisfies SerializedVisualizationSettings;
  }

  const annotationsState = getAnnotationsState();
  const formatState = getFormatState();
  const legendState = getLegendState();
  const projectionState = getProjectionState();

  serialized.layoutSettings = {
    format: formatState,
    annotations: {
      visible: annotationsState.visible,
      items: annotationsState.items,
      activeType: annotationsState.activeType,
      predefinedStyle: annotationsState.predefinedStyle,
      defaultStyle: annotationsState.defaultStyle
    },
    legend: {
      items: legendState.items,
      position: legendState.position,
      visible: legendState.visible,
      style: legendState.style,
      hasBeenOpened: legendState.hasBeenOpened
    },
    geoIndications: geoIndicationsState,
    projection: {
      selected:
        projectionActions.getCurrentProjectionInfo()?.id ||
        projectionState.selected ||
        'mercator',
      longitude: projectionState.longitude ?? 0,
      latitude: projectionState.latitude ?? 0,
      rotation: projectionState.rotation ?? 0,
      scale: projectionState.scale ?? 1,
      center: projectionState.center,
      customCode: projectionState.customCode
    }
  } satisfies SerializedLayoutSettings;

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

      if (Array.isArray(metadata) && validMetadata.length !== metadata.length) {
        logger.warn(
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
      logger.warn(
        'Failed to restore custom basemaps',
        LogCategory.PROJECT,
        error
      );
    }
  }

  if (data.basemapSettings) {
    try {
      const { layers, style, mapProjection } = data.basemapSettings;
      if (layers) {
        basemapLayersStore.restoreFromSerialized(layers);
      }
      if (style) {
        basemapStyleStore.restoreFromSerialized(style);
      }
      if (mapProjection) {
        mapProjectionStore.restoreFromSerialized(mapProjection);
      }
      logger.debug('Basemap settings restored', LogCategory.PROJECT);
    } catch (error) {
      logger.warn(
        'Failed to restore basemap settings',
        LogCategory.PROJECT,
        error
      );
    }
  }

  if (data.visualizationSettings) {
    try {
      visualizationStore.restoreFromSerialized(data.visualizationSettings);
      logger.debug('Visualization settings restored', LogCategory.PROJECT);
    } catch (error) {
      logger.warn(
        'Failed to restore visualization settings',
        LogCategory.PROJECT,
        error
      );
    }
  }

  if (data.layoutSettings) {
    try {
      const { format, annotations, legend, geoIndications, projection } =
        data.layoutSettings;

      if (format) {
        formatActions.setState(format);
      }

      if (annotations) {
        annotationsActions.setState({
          visible: annotations.visible ?? true,
          items: annotations.items,
          activeType: annotations.activeType,
          predefinedStyle: annotations.predefinedStyle,
          defaultStyle: annotations.defaultStyle,
          selectedId: null,
          textContent: ''
        });
      }

      if (legend) {
        legendActions.setState({
          items: legend.items,
          position: legend.position,
          visible: legend.visible,
          style: legend.style,
          hasBeenOpened: legend.hasBeenOpened ?? false
        });
      }

      if (geoIndications) {
        geoIndicationsActions.setState({
          ...geoIndications,
          visible: geoIndications.visible ?? true
        });
      }

      if (projection) {
        if (projection.customCode !== undefined) {
          projectionActions.setCustomCode(projection.customCode ?? null);
        }
        projectionActions.setSelected(projection.selected);
        if (projection.center && projection.center.length === 2) {
          projectionActions.setCenter(
            projection.center[0],
            projection.center[1]
          );
        } else if (
          projection.longitude !== undefined &&
          projection.latitude !== undefined
        ) {
          projectionActions.setCenter(
            projection.longitude,
            projection.latitude
          );
        }
        if (projection.rotation !== undefined) {
          projectionActions.setRotation(projection.rotation);
        }
        if (projection.scale !== undefined) {
          projectionActions.setScale(projection.scale);
        }
      }

      logger.debug('Layout settings restored', LogCategory.PROJECT);
    } catch (error) {
      logger.warn(
        'Failed to restore layout settings',
        LogCategory.PROJECT,
        error
      );
    }
  }

  return deserialized;
}

export async function prepareForIndexedDB(
  project: KhartisProject
): Promise<SerializedProject> {
  const serialized = await serialize(project, { preserveBinary: true });
  return deepCloneForStorage(serialized) as SerializedProject;
}
