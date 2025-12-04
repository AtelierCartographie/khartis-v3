import type { KhartisProject } from '../types';
import { deserialize } from '../core/serializer';
import { saveProject } from '../core/persistence';
import { decompressData } from '$lib/features/commons/utils/compression.utils';
import type { SerializedProject } from '$lib/types/serialization.types';

export async function importProject(file: File): Promise<KhartisProject> {
  const contents = await readFile(file);
  const projectData = JSON.parse(contents);

  if (!isSerializedProjectRecord(projectData)) {
    throw new Error('Invalid project file structure');
  }

  const project = await deserialize({
    ...projectData,
    id: projectData.id || crypto.randomUUID(),
    manifest: {
      ...projectData.manifest,
      updatedAt: new Date().toISOString()
    }
  });

  await saveProject(project);
  return project;
}

async function readFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  try {
    return await decompressData(buffer);
  } catch {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
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
