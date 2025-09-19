import type { KhartisProject } from '../store/project.types';
import type { UploadedFile } from '../store/create-project.types';

export class ProjectSerializer {
  static serialize(project: KhartisProject): any {
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
      data: project.data ? this.serializeProjectData(project.data) : undefined,
      visualization: project.visualization,
      layout: project.layout,
      resources: project.resources
    };
  }

  static deserialize(data: any): KhartisProject {
    return {
      ...data,
      manifest: {
        ...data.manifest,
        createdAt: new Date(data.manifest.createdAt),
        updatedAt: new Date(data.manifest.updatedAt)
      },
      data: data.data ? this.deserializeProjectData(data.data) : undefined
    };
  }

  private static serializeProjectData(data: any): any {
    if (!data) return data;

    const serialized = { ...data };

    if (data.sourceFiles && Array.isArray(data.sourceFiles)) {
      serialized.sourceFiles = data.sourceFiles.map((file: UploadedFile) =>
        this.serializeUploadedFile(file)
      );
    }

    return serialized;
  }

  private static deserializeProjectData(data: any): any {
    if (!data) return data;

    const deserialized = { ...data };

    if (data.sourceFiles && Array.isArray(data.sourceFiles)) {
      deserialized.sourceFiles = data.sourceFiles.map((file: any) =>
        this.deserializeUploadedFile(file)
      );
    }

    return deserialized;
  }

  private static serializeUploadedFile(file: UploadedFile): any {
    const serialized: any = {
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
    };

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
  }

  private static deserializeUploadedFile(data: any): UploadedFile {
    const file: UploadedFile = {
      id: data.id,
      name: data.name,
      size: data.size,
      type: data.type,
      fileType: data.fileType,
      status: data.status,
      errorMessage: data.errorMessage,
      validation: data.validation,
      sourceType: data.sourceType,
      relatedFiles: data.relatedFiles,
      uploadProgress: data.uploadProgress
    };

    if (data.parsedData) {
      file.parsedData = data.parsedData;
    }

    if (data.statistics) {
      file.statistics = data.statistics;
    }

    if (data.content) {
      if (data.contentType === 'string') {
        file.content = data.content;
      } else if (
        data.contentType === 'arraybuffer' &&
        Array.isArray(data.content)
      ) {
        file.content = new Uint8Array(data.content).buffer;
      }
    }

    return file;
  }

  static prepareForIndexedDB(project: KhartisProject): any {
    const serialized = this.serialize(project);

    const cleaned = JSON.parse(JSON.stringify(serialized));

    return cleaned;
  }
}
