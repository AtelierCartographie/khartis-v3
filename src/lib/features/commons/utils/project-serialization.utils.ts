import type { KhartisProject } from '../store/project.types';
import type { UploadedFile } from '../store/create-project.types';
import type {
  SerializedProject,
  SerializedProjectData,
  SerializedUploadedFile
} from '$lib/types/serialization.types';

export const ProjectSerializer = {
  serialize(project: KhartisProject): SerializedProject {
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
      data: project.data
        ? ProjectSerializer.serializeProjectData(project.data)
        : undefined,
      visualization: project.visualization,
      layout: project.layout,
      resources: project.resources
    };
  },

  deserialize(data: SerializedProject): KhartisProject {
    const project: KhartisProject = {
      ...data,
      manifest: {
        ...data.manifest,
        createdAt: new Date(data.manifest.createdAt),
        updatedAt: new Date(data.manifest.updatedAt)
      } as KhartisProject['manifest'],
      data: data.data
        ? (ProjectSerializer.deserializeProjectData(
            data.data
          ) as KhartisProject['data'])
        : undefined
    } as KhartisProject;

    return project;
  },

  serializeProjectData(data: unknown): SerializedProjectData | undefined {
    if (!data) return undefined;
    if (typeof data !== 'object' || data === null) return undefined;

    const serialized = { ...data } as SerializedProjectData;
    const dataObj = data as Record<string, unknown>;

    if (dataObj.sourceFiles && Array.isArray(dataObj.sourceFiles)) {
      serialized.sourceFiles = dataObj.sourceFiles.map((file: UploadedFile) =>
        ProjectSerializer.serializeUploadedFile(file)
      );
    }

    return serialized;
  },

  deserializeProjectData(data: SerializedProjectData): unknown {
    if (!data) return data;

    const deserialized = { ...data };

    if (data.sourceFiles && Array.isArray(data.sourceFiles)) {
      deserialized.sourceFiles = data.sourceFiles.map(
        (file: SerializedUploadedFile) =>
          ProjectSerializer.deserializeUploadedFile(file)
      ) as SerializedUploadedFile[];
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

  prepareForIndexedDB(project: KhartisProject): SerializedProject {
    const serialized = ProjectSerializer.serialize(project);

    const cleaned = JSON.parse(JSON.stringify(serialized));

    return cleaned;
  }
} as const;
