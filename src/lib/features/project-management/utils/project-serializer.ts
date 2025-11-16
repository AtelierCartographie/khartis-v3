import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import { basemapCatalogService } from '$lib/features/map/services';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { DatasetResult } from '$lib/features/data-pipeline';
import type { KhartisProject } from '$lib/features/project-management/models/project';
import type {
  SerializedBasemapAttribute,
  SerializedDatasetResult,
  SerializedProject,
  SerializedProjectData,
  SerializedUploadedFile
} from '$lib/types/serialization.types';

export const ProjectSerializer = {
  async serialize(project: KhartisProject): Promise<SerializedProject> {
    const serializedData = project.data
      ? await ProjectSerializer.serializeProjectData(project.data)
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
  },

  async deserialize(data: SerializedProject): Promise<KhartisProject> {
    const deserializedData = data.data
      ? ((await ProjectSerializer.deserializeProjectData(
          data.data
        )) as KhartisProject['data'])
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
  },

  async serializeProjectData(
    data: unknown
  ): Promise<SerializedProjectData | undefined> {
    if (!data) return undefined;
    if (typeof data !== 'object' || data === null) return undefined;

    const serialized = { ...data } as SerializedProjectData;
    const dataObj = data as Record<string, unknown>;

    if (dataObj.sourceFiles && Array.isArray(dataObj.sourceFiles)) {
      serialized.sourceFiles = dataObj.sourceFiles.map((file: UploadedFile) =>
        ProjectSerializer.serializeUploadedFile(file)
      );
    }

    // Serialize custom basemaps if any exist
    const customBasemaps = basemapCatalogService.basemaps.filter(
      (b: BasemapMetadata) => b.isCustom
    );

    if (customBasemaps.length > 0 && Duck) {
      try {
        // Check if custom_basemap_attributes table exists
        const tableExists = await Duck.query(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='custom_basemap_attributes'`,
          { format: 'array' }
        );

        if (
          tableExists &&
          Array.isArray(tableExists) &&
          tableExists.length > 0
        ) {
          // Query all custom basemap attributes
          const attributes = (await Duck.query(
            'SELECT * FROM custom_basemap_attributes',
            { format: 'array' }
          )) as SerializedBasemapAttribute[];

          serialized.customBasemaps = {
            metadata: customBasemaps,
            attributes: attributes || []
          };

          logger.info(
            `Serialized ${customBasemaps.length} custom basemaps with ${attributes?.length || 0} attributes`,
            LogCategory.DATA
          );
        }
      } catch (error) {
        logger.warn(
          'Failed to serialize custom basemap attributes',
          LogCategory.DATA,
          error
        );
      }
    }

    return serialized;
  },

  async deserializeProjectData(data: SerializedProjectData): Promise<unknown> {
    if (!data) return data;

    const deserialized = { ...data };

    if (data.sourceFiles && Array.isArray(data.sourceFiles)) {
      deserialized.sourceFiles = data.sourceFiles.map(
        (file: SerializedUploadedFile) =>
          ProjectSerializer.deserializeUploadedFile(file)
      ) as SerializedUploadedFile[];
    }

    // Restore custom basemaps if any were saved
    if (data.customBasemaps && Duck) {
      try {
        const { metadata, attributes } = data.customBasemaps;

        // Recreate custom_basemap_attributes table
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

        // Clear existing data (in case table already existed)
        await Duck.query('DELETE FROM custom_basemap_attributes');

        // Insert all attributes if any exist
        if (attributes && attributes.length > 0) {
          const insertValues = attributes
            .map(
              (attr) =>
                `('${attr.raw.replace(/'/g, "''")}', '${attr.id.replace(/'/g, "''")}', '${attr.variant.replace(/'/g, "''")}', '${attr.normalized}', '${attr.basemap.replace(/'/g, "''")}', ${attr.basemap_count})`
            )
            .join(',\n');

          await Duck.query(`
            INSERT INTO custom_basemap_attributes (raw, id, variant, normalized, basemap, basemap_count)
            VALUES ${insertValues}
          `);

          logger.info(
            `Restored ${attributes.length} custom basemap attributes`,
            LogCategory.DATA
          );
        }

        // Re-register custom basemaps in catalog
        metadata.forEach((basemap: BasemapMetadata) => {
          basemapCatalogService.addCustomBasemap(basemap);
        });

        logger.success(
          `Restored ${metadata.length} custom basemaps`,
          LogCategory.DATA
        );
      } catch (error) {
        logger.error(
          'Failed to restore custom basemaps',
          LogCategory.DATA,
          error
        );
      }
    }

    return deserialized;
  },

  serializeUploadedFile(file: UploadedFile): SerializedUploadedFile {
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

    // Cached dataset metadata no longer persisted – pipeline reloads from DuckDB

    if (file.content) {
      if (typeof file.content === 'string') {
        serialized.content = file.content;
        serialized.contentType = 'string';
      } else if (file.content instanceof ArrayBuffer) {
        serialized.content = Array.from(new Uint8Array(file.content));
        serialized.contentType = 'arraybuffer';
      }
    }

    return serialized;
  },

  deserializeUploadedFile(data: SerializedUploadedFile): UploadedFile {
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

    // Cached dataset metadata no longer persisted – pipeline reloads from DuckDB

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

    return file as UploadedFile;
  },

  serializeDatasetResult(dataset: DatasetResult): SerializedDatasetResult {
    return {
      ...dataset,
      metadata: {
        ...dataset.metadata,
        processedAt: dataset.metadata.processedAt.toISOString()
      },
      createdAt: dataset.createdAt ? dataset.createdAt.toISOString() : undefined
    };
  },

  deserializeDatasetResult(data: SerializedDatasetResult): DatasetResult {
    return {
      ...data,
      metadata: {
        ...data.metadata,
        processedAt: new Date(data.metadata.processedAt)
      },
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined
    };
  },

  /**
   * Prepares a project for IndexedDB storage
   *
   * This method performs two distinct operations:
   * 1. serialize() - Logical conversion (Dates → ISO strings, ArrayBuffers → arrays, custom basemaps)
   * 2. JSON round-trip - Normalization for IndexedDB compatibility
   *
   * The JSON.parse(JSON.stringify()) is NOT redundant serialization.
   * It's required to strip non-cloneable references that IndexedDB cannot store:
   * - Object prototypes and class instances
   * - Functions and getters
   * - Circular references
   * - Svelte proxies and reactive objects
   *
   * Alternatives tested:
   * - structuredClone(): Fails with "could not be cloned" error on complex objects
   * - Direct storage: Fails with IndexedDB DataCloneError
   *
   * Performance: This operation is only called on save (user-initiated), not on read.
   * The JSON round-trip ensures reliable storage across all browsers.
   */
  async prepareForIndexedDB(
    project: KhartisProject
  ): Promise<SerializedProject> {
    const serialized = await ProjectSerializer.serialize(project);
    return JSON.parse(JSON.stringify(serialized));
  }
} as const;
