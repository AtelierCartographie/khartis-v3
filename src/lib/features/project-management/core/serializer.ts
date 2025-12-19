import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { Duck, duckDBOrchestrator } from '$lib/features/duckdb';
import { basemapCatalogService } from '$lib/features/map/services';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type {
  SerializedBasemapAttribute,
  SerializedProject,
  SerializedProjectData,
  SerializedUploadedFile
} from '$lib/types/serialization.types';
import type { KhartisProject } from '../types';
import { bigIntReplacer } from '../utils/json-helpers';

export async function serialize(
  project: KhartisProject
): Promise<SerializedProject> {
  const serializedData = project.data
    ? await serializeProjectData(project.data)
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
  data: unknown
): Promise<SerializedProjectData | undefined> {
  if (!data) return undefined;
  if (typeof data !== 'object' || data === null) return undefined;

  const serialized = { ...data } as SerializedProjectData;
  const dataObj = data as Record<string, unknown>;

  if (dataObj.sourceFiles && Array.isArray(dataObj.sourceFiles)) {
    serialized.sourceFiles = dataObj.sourceFiles.map((file: UploadedFile) =>
      serializeUploadedFile(file)
    );
  }

  const customBasemaps = basemapCatalogService.basemaps.filter(
    (b: BasemapMetadata) => b.isCustom
  );

  if (customBasemaps.length > 0 && Duck) {
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

  if (data.customBasemaps && Duck) {
    try {
      const { metadata, attributes } = data.customBasemaps;

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

      if (attributes && attributes.length > 0) {
        const insertValues = attributes
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

      metadata.forEach((basemap: BasemapMetadata) => {
        basemapCatalogService.addCustomBasemap(basemap);
      });
    } catch (error) {
      logger.error(
        'Failed to restore custom basemaps',
        LogCategory.DATA,
        error
      );
    }
  }

  return deserialized;
}

export function serializeUploadedFile(
  file: UploadedFile
): SerializedUploadedFile {
  const serialized = {
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.type,
    fileType: file.fileType,
    status: file.status,
    errorMessage: file.errorMessage,
    validation: file.validation,
    sourceType: file.sourceType,
    relatedFiles: file.relatedFiles,
    uploadProgress: file.uploadProgress
  } as SerializedUploadedFile;

  if (file.parsedData) {
    serialized.parsedData = file.parsedData;
  }

  if (file.statistics) {
    serialized.statistics = file.statistics;
  }

  if (file.preparedGeoJSON) {
    serialized.preparedGeoJSON = file.preparedGeoJSON;
  }

  if (file.duplicates) {
    serialized.duplicates = file.duplicates;
  }

  if (file.deepAnalysis) {
    serialized.deepAnalysis = file.deepAnalysis;
  }

  if (file.geoMatchResult) {
    serialized.geoMatchResult = file.geoMatchResult;
  }

  if (file.content) {
    if (typeof file.content === 'string') {
      serialized.content = file.content;
      serialized.contentType = 'string';
    } else if (file.content instanceof ArrayBuffer) {
      serialized.content = Array.from(new Uint8Array(file.content));
      serialized.contentType = 'arraybuffer';
    }
  }

  if (file.relatedFilesData) {
    const serializedData: Record<string, number[]> = {};
    for (const [name, buffer] of Object.entries(file.relatedFilesData)) {
      serializedData[name] = Array.from(new Uint8Array(buffer));
    }
    serialized.relatedFilesData = serializedData;
  }

  if (file.columnTransformations && file.columnTransformations.length > 0) {
    serialized.columnTransformations = file.columnTransformations;
  }

  if (file.deletedRowIds && file.deletedRowIds.length > 0) {
    serialized.deletedRowIds = file.deletedRowIds;
  }

  const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(file.id);
  if (duckDBDataset) {
    if (duckDBDataset.joinedBasemap) {
      serialized.joinedBasemap = duckDBDataset.joinedBasemap;
    }
    if (duckDBDataset.geoColumn) {
      serialized.geoColumn = duckDBDataset.geoColumn;
    }
    if (duckDBDataset.gpsMode) {
      serialized.gpsMode = duckDBDataset.gpsMode;
    }
    if (duckDBDataset.gpsColumns) {
      serialized.gpsColumns = duckDBDataset.gpsColumns;
    }
  }

  if (file.sourceArchive) {
    serialized.sourceArchive = file.sourceArchive;
  }

  if (file.duckdbTableName) {
    serialized.duckdbTableName = file.duckdbTableName;
  }

  return serialized;
}

export function deserializeUploadedFile(
  data: SerializedUploadedFile
): UploadedFile {
  const file = {
    id: data.id,
    name: data.name,
    size: data.size,
    type: data.type,
    fileType: data.fileType as UploadedFile['fileType'],
    status: data.status as UploadedFile['status'],
    errorMessage: data.errorMessage,
    validation: data.validation as UploadedFile['validation'],
    sourceType: data.sourceType as UploadedFile['sourceType'],
    relatedFiles: data.relatedFiles,
    uploadProgress: data.uploadProgress
  } as UploadedFile;

  if (data.parsedData) {
    file.parsedData = data.parsedData as UploadedFile['parsedData'];
  }

  if (data.statistics) {
    file.statistics = data.statistics as UploadedFile['statistics'];
  }

  if (data.preparedGeoJSON) {
    file.preparedGeoJSON = data.preparedGeoJSON;
  }

  if (data.duplicates) {
    file.duplicates = data.duplicates;
  }

  if (data.deepAnalysis) {
    file.deepAnalysis = data.deepAnalysis;
  }

  if (data.geoMatchResult) {
    file.geoMatchResult = data.geoMatchResult;
  }

  if (data.content) {
    if (data.contentType === 'string' && typeof data.content === 'string') {
      file.content = data.content;
    } else if (
      data.contentType === 'arraybuffer' &&
      Array.isArray(data.content)
    ) {
      file.content = new Uint8Array(data.content).buffer;
    }
  }

  if (data.relatedFilesData) {
    const relatedData: Record<string, ArrayBuffer> = {};
    for (const [name, bytes] of Object.entries(data.relatedFilesData)) {
      relatedData[name] = new Uint8Array(bytes).buffer;
    }
    file.relatedFilesData = relatedData;
  }

  if (data.columnTransformations) {
    file.columnTransformations = data.columnTransformations;
  }

  if (data.deletedRowIds) {
    file.deletedRowIds = data.deletedRowIds;
  }

  if (data.joinedBasemap) {
    file.joinedBasemap = data.joinedBasemap;
  }
  if (data.geoColumn) {
    file.geoColumn = data.geoColumn;
  }
  if (data.gpsMode) {
    file.gpsMode = data.gpsMode;
  }
  if (data.gpsColumns) {
    file.gpsColumns = data.gpsColumns;
  }
  if (data.sourceArchive) {
    file.sourceArchive = data.sourceArchive;
  }
  if (data.duckdbTableName) {
    file.duckdbTableName = data.duckdbTableName;
  }

  return file as UploadedFile;
}

export async function prepareForIndexedDB(
  project: KhartisProject
): Promise<SerializedProject> {
  const serialized = await serialize(project);
  return JSON.parse(JSON.stringify(serialized, bigIntReplacer));
}
