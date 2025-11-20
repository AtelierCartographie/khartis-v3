import type { KhartisProject, SavedProjectMetadata } from '../models/project';
import { ProjectStorageKey } from '../models/project';
import { projectStorage } from './project-storage';
import { ProjectSerializer } from '../utils/project-serializer';

const DB_NAME = 'KhartisDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export class ProjectRepository {
  private db?: IDBDatabase;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;

        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: 'id'
          });
          store.createIndex('updatedAt', 'manifest.updatedAt', {
            unique: false
          });
          store.createIndex('name', 'manifest.name', { unique: false });
        }
      };
    });
  }

  async save(project: KhartisProject): Promise<void> {
    await this.ensureDb();

    const serialized = await ProjectSerializer.prepareForIndexedDB(project);
    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(serialized);

      request.onsuccess = async () => {
        await this.updateMetadata(project);
        resolve();
      };
      request.onerror = () =>
        reject(request.error || new Error('Failed to save project'));
    });
  }

  async load(id: string): Promise<KhartisProject | null> {
    await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = async () => {
        if (!request.result) {
          resolve(null);
          return;
        }

        try {
          const project = await ProjectSerializer.deserialize(request.result);
          resolve(project);
        } catch (error) {
          reject(new Error(`Failed to deserialize project: ${error}`));
        }
      };

      request.onerror = () => reject(new Error('Failed to load project'));
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = async () => {
        await this.removeFromMetadata(id);
        resolve();
      };
      request.onerror = () =>
        reject(request.error || new Error('Failed to delete project'));
    });
  }

  async listMetadata(): Promise<SavedProjectMetadata[]> {
    const metadata =
      (await projectStorage.load<SavedProjectMetadata[]>(
        ProjectStorageKey.METADATA
      )) ?? [];

    const normalized = metadata.map((entry) => ({
      ...entry,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt)
    }));

    return normalized.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  private async ensureDb(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  private async updateMetadata(project: KhartisProject): Promise<void> {
    const metadata = await this.getMetadataList();
    const index = metadata.findIndex((entry) => entry.id === project.id);

    const entry: SavedProjectMetadata = {
      id: project.id,
      name: project.manifest.name,
      description: project.manifest.description,
      createdAt: project.manifest.createdAt,
      updatedAt: project.manifest.updatedAt,
      size: this.calculateProjectSize(project)
    };

    if (index >= 0) {
      metadata[index] = entry;
    } else {
      metadata.push(entry);
    }

    await projectStorage.save(ProjectStorageKey.METADATA, metadata);
  }

  private async removeFromMetadata(id: string): Promise<void> {
    const metadata = await this.getMetadataList();
    const filtered = metadata.filter((entry) => entry.id !== id);
    await projectStorage.save(ProjectStorageKey.METADATA, filtered);
  }

  private async getMetadataList(): Promise<SavedProjectMetadata[]> {
    return (
      (await projectStorage.load<SavedProjectMetadata[]>(
        ProjectStorageKey.METADATA
      )) ?? []
    );
  }

  private calculateProjectSize(project: KhartisProject): number {
    const json = JSON.stringify(project);
    return new Blob([json]).size;
  }
}

export const projectRepository = new ProjectRepository();
