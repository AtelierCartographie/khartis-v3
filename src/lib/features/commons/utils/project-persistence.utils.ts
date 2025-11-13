import localforage from 'localforage';
import type {
  KhartisProject,
  SavedProjectMetadata
} from '../store/project.types';
import { ProjectStorageKey } from '../store/project.types';
import { compressData, decompressData } from './compression.utils';
import { logger, LogCategory } from './logger';
import { ProjectSerializer } from './project-serialization.utils';
import type { SerializedProject } from '$lib/types/serialization.types';

const DB_NAME = 'KhartisDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export class ProjectPersistence {
  private db?: IDBDatabase;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'manifest.updatedAt', {
            unique: false
          });
          store.createIndex('name', 'manifest.name', { unique: false });
        }
      };
    });
  }

  async saveProject(project: KhartisProject): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      try {
        const serializedProject =
          ProjectSerializer.prepareForIndexedDB(project);

        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(serializedProject);

        request.onsuccess = async () => {
          await this.updateMetadata(project);
          resolve();
        };

        request.onerror = () => {
          reject(request.error || new Error('Failed to save project'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadProject(id: string): Promise<KhartisProject | null> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          try {
            const project = ProjectSerializer.deserialize(request.result);
            resolve(project);
          } catch (error) {
            reject(new Error(`Failed to deserialize project: ${error}`));
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to load project'));
      };
    });
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = async () => {
        await this.removeFromMetadata(id);
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to delete project'));
      };
    });
  }

  async listProjects(): Promise<SavedProjectMetadata[]> {
    const metadataJson = await localforage.getItem<string>(
      ProjectStorageKey.METADATA
    );
    if (!metadataJson) {
      return [];
    }

    try {
      const metadata = JSON.parse(metadataJson);
      return metadata.sort(
        (a: SavedProjectMetadata, b: SavedProjectMetadata) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  private async updateMetadata(project: KhartisProject): Promise<void> {
    const metadata = await this.getMetadataList();
    const existingIndex = metadata.findIndex((m) => m.id === project.id);

    const projectMetadata: SavedProjectMetadata = {
      id: project.id,
      name: project.manifest.name,
      description: project.manifest.description,
      createdAt: project.manifest.createdAt,
      updatedAt: project.manifest.updatedAt,
      size: this.calculateProjectSize(project)
    };

    if (existingIndex >= 0) {
      metadata[existingIndex] = projectMetadata;
    } else {
      metadata.push(projectMetadata);
    }

    await localforage.setItem(
      ProjectStorageKey.METADATA,
      JSON.stringify(metadata)
    );
  }

  private async removeFromMetadata(id: string): Promise<void> {
    const metadata = await this.getMetadataList();
    const filtered = metadata.filter((m) => m.id !== id);
    await localforage.setItem(
      ProjectStorageKey.METADATA,
      JSON.stringify(filtered)
    );
  }

  private async getMetadataList(): Promise<SavedProjectMetadata[]> {
    const metadataJson = await localforage.getItem<string>(
      ProjectStorageKey.METADATA
    );
    if (!metadataJson) {
      return [];
    }

    try {
      return JSON.parse(metadataJson);
    } catch {
      return [];
    }
  }

  private calculateProjectSize(project: KhartisProject): number {
    const json = JSON.stringify(project);
    return new Blob([json]).size;
  }

  async exportProject(project: KhartisProject): Promise<Blob> {
    const serializedProject = ProjectSerializer.serialize(project);
    const projectData = {
      ...serializedProject,
      exportDate: new Date().toISOString(),
      appVersion: '3.0.0'
    };

    const json = JSON.stringify(projectData, null, 2);
    return new Blob([json], { type: 'application/json' });
  }

  async importProject(file: File): Promise<KhartisProject> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          let content: string;

          try {
            content = await decompressData(buffer);
          } catch (_decompressError) {
            const decoder = new TextDecoder();
            content = decoder.decode(buffer);
          }

          const projectData = JSON.parse(content);

          if (!this.validateProjectStructure(projectData)) {
            throw new Error('Invalid project file structure');
          }

          const project: KhartisProject = ProjectSerializer.deserialize({
            ...projectData,
            id: projectData.id || crypto.randomUUID(),
            manifest: {
              ...projectData.manifest,
              updatedAt: new Date().toISOString()
            }
          });

          await this.saveProject(project);
          resolve(project);
        } catch (error) {
          reject(new Error(`Failed to import project: ${error}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read project file'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  private validateProjectStructure(data: unknown): data is SerializedProject {
    return isSerializedProjectRecord(data);
  }

  async saveToStorage(key: string, data: unknown): Promise<void> {
    try {
      await localforage.setItem(key, JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to save to storage', LogCategory.PERSISTENCE, error);
      throw new Error('Storage quota exceeded or storage unavailable');
    }
  }

  async loadFromStorage<T>(key: string): Promise<T | null> {
    try {
      const item = await localforage.getItem<string>(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }

  async clearStorage(key: string): Promise<void> {
    await localforage.removeItem(key);
  }

  async createProjectArchive(project: KhartisProject): Promise<Blob> {
    const archive = {
      manifest: {
        ...project.manifest,
        format: 'kh' as const,
        exportDate: new Date().toISOString()
      },
      data: project.data,
      visualization: project.visualization,
      layout: project.layout,
      resources: project.resources
    };

    const json = JSON.stringify(archive);
    const compressed = await compressData(json);
    return new Blob([compressed], { type: 'application/octet-stream' });
  }
}

function isSerializedProjectRecord(
  data: unknown
): data is SerializedProject {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;
  const manifest = record.manifest;

  if (typeof record.id !== 'string') {
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

export const projectPersistence = new ProjectPersistence();
