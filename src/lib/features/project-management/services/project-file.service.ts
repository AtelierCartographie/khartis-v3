import { projectRepository } from './project-repository';
import { ProjectSerializer } from '../utils/project-serializer';
import type { KhartisProject } from '../models/project';
import {
  compressData,
  decompressData
} from '$lib/features/commons/utils/compression.utils';
import type { SerializedProject } from '$lib/types/serialization.types';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

export class ProjectFileService {
  constructor(private readonly repository = projectRepository) {}

  async exportProject(project: KhartisProject): Promise<Blob> {
    const serialized = await ProjectSerializer.serialize(project);
    const payload = {
      ...serialized,
      exportDate: new Date().toISOString(),
      appVersion: '3.0.0'
    };

    return new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
  }

  async createArchive(project: KhartisProject): Promise<Blob> {
    const serialized = await ProjectSerializer.serialize(project);

    const archive = {
      manifest: {
        ...serialized.manifest,
        format: 'kh' as const,
        exportDate: new Date().toISOString()
      },
      data: serialized.data,
      visualization: serialized.visualization,
      layout: serialized.layout,
      resources: serialized.resources
    };

    const json = JSON.stringify(archive, bigIntReplacer);
    const compressed = await compressData(json);
    return new Blob([compressed], { type: 'application/octet-stream' });
  }

  async importProject(file: File): Promise<KhartisProject> {
    const contents = await this.readFile(file);
    const projectData = JSON.parse(contents);

    if (!isSerializedProjectRecord(projectData)) {
      throw new Error('Invalid project file structure');
    }

    const project = await ProjectSerializer.deserialize({
      ...projectData,
      id: projectData.id || crypto.randomUUID(),
      manifest: {
        ...projectData.manifest,
        updatedAt: new Date().toISOString()
      }
    });

    await this.repository.save(project);
    return project;
  }

  private async readFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();

    try {
      // .kh archives are gzipped; attempt decompress before falling back to plain JSON.
      return await decompressData(buffer);
    } catch {
      const decoder = new TextDecoder();
      return decoder.decode(buffer);
    }
  }
}

function isSerializedProjectRecord(data: unknown): data is SerializedProject {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;
  const manifest = record.manifest;

  if (typeof record.id !== 'string' && typeof record.id !== 'undefined') {
    return false;
  }

  if (typeof manifest !== 'object' || manifest === null) {
    return false;
  }

  const manifestRecord = manifest as Record<string, unknown>;
  return (
    typeof manifestRecord.version === 'string' &&
    typeof manifestRecord.name === 'string' &&
    typeof manifestRecord.createdAt === 'string' &&
    typeof manifestRecord.updatedAt === 'string'
  );
}

export const projectFiles = new ProjectFileService();
