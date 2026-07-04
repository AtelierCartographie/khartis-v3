import { describe, expect, it } from 'vitest';
import {
  addToHistory,
  redo,
  undo
} from '$lib/features/commons/stores/project/project-history';
import {
  createProjectState,
  type ProjectStateContainer
} from '$lib/features/commons/stores/project/project-state.svelte';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import {
  DataSourceType,
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import type { KhartisProject } from '$lib/features/project-management';

function createContainer(): ProjectStateContainer {
  return { _state: createProjectState() };
}

function createProject(name: string): KhartisProject {
  const sourceFile: UploadedFile = {
    id: 'source-1',
    name: 'data.csv',
    size: 128,
    type: 'text/csv',
    fileType: FileType.CSV,
    status: FileStatus.COMPLETE,
    sourceType: DataSourceType.FILE_UPLOAD,
    uploadProgress: 100,
    content: new ArrayBuffer(8),
    parsedData: [{ country: 'France', value: 1 }],
    preparedGeoJSON: '{"type":"FeatureCollection","features":[]}',
    relatedFilesData: { 'data.dbf': new ArrayBuffer(4) },
    assetRef: {
      assetId: 'asset-1',
      originalName: 'data.csv',
      mimeType: 'text/csv',
      size: 128,
      kind: 'primary'
    },
    duckdbTableName: 'dataset_source_1'
  };

  return {
    id: 'project-1',
    manifest: {
      version: '3.0.0',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      name,
      format: 'kh'
    },
    data: {
      sourceFiles: [sourceFile]
    }
  };
}

function firstHistoryFile(
  container: ProjectStateContainer
): Record<string, unknown> {
  return container._state.history[0]?.snapshot?.data
    ?.sourceFiles[0] as unknown as Record<string, unknown>;
}

describe('project history snapshots', () => {
  it('stores metadata-only source files without corrupting project dates', () => {
    const container = createContainer();
    container._state.currentProject = createProject('Initial');

    addToHistory(container, 'initial');

    const snapshot = container._state.history[0]?.snapshot as KhartisProject;
    const file = firstHistoryFile(container);

    expect(snapshot.manifest.createdAt).toBeInstanceOf(Date);
    expect(snapshot.manifest.updatedAt).toBeInstanceOf(Date);
    expect(file.content).toBeUndefined();
    expect(file.parsedData).toBeUndefined();
    expect(file.preparedGeoJSON).toBeUndefined();
    expect(file.relatedFilesData).toBeUndefined();
    expect(file.assetRef).toEqual({
      assetId: 'asset-1',
      originalName: 'data.csv',
      mimeType: 'text/csv',
      size: 128,
      kind: 'primary'
    });
    expect(file.duckdbTableName).toBe('dataset_source_1');
  });

  it('rehydrates dates when restoring legacy string-dated snapshots', () => {
    const container = createContainer();
    container._state.currentProject = createProject('Initial');
    addToHistory(container, 'initial');

    container._state.currentProject = createProject('Renamed');
    addToHistory(container, 'rename');

    const legacySnapshot = container._state.history[0]?.snapshot as unknown as {
      manifest: { createdAt: string; updatedAt: string };
    };
    legacySnapshot.manifest.createdAt = '2026-01-01T00:00:00.000Z';
    legacySnapshot.manifest.updatedAt = '2026-01-02T00:00:00.000Z';

    expect(undo(container)).toBe(true);
    expect(container._state.currentProject?.manifest.name).toBe('Initial');
    expect(container._state.currentProject?.manifest.createdAt).toBeInstanceOf(
      Date
    );
    expect(container._state.currentProject?.manifest.updatedAt).toBeInstanceOf(
      Date
    );

    expect(redo(container)).toBe(true);
    expect(container._state.currentProject?.manifest.name).toBe('Renamed');
    expect(container._state.currentProject?.manifest.createdAt).toBeInstanceOf(
      Date
    );
    expect(container._state.currentProject?.manifest.updatedAt).toBeInstanceOf(
      Date
    );
  });
});
