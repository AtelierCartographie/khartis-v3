import { describe, expect, it } from 'vitest';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import {
  DataSourceType,
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import type { KhartisProject } from '$lib/features/project-management';
import { addToHistory, redo, undo } from './project-history';
import {
  createProjectState,
  type ProjectStateContainer
} from './project-state.svelte';

function createProject(
  name: string,
  sourceFiles: UploadedFile[]
): KhartisProject {
  return {
    id: name,
    manifest: {
      version: '1.0.0',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
      name,
      format: 'kh'
    },
    data: {
      sourceFiles
    }
  };
}

function createContainer(project: KhartisProject): ProjectStateContainer {
  const state = createProjectState();
  state.currentProject = project;

  return { _state: state };
}

function createSourceFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'source-1',
    name: 'source.csv',
    size: 42,
    type: 'text/csv',
    fileType: FileType.CSV,
    status: FileStatus.COMPLETE,
    sourceType: DataSourceType.FILE_UPLOAD,
    duckdbTableName: 'source_table',
    content: new ArrayBuffer(8),
    relatedFilesData: {
      dbf: new ArrayBuffer(4)
    },
    parsedData: [{ label: 'Paris' }],
    preparedGeoJSON: '{"type":"FeatureCollection","features":[]}',
    ...overrides
  };
}

describe('project history snapshots', () => {
  it('stores source file metadata without heavy file payloads', () => {
    const container = createContainer(
      createProject('metadata-history', [createSourceFile()])
    );

    addToHistory(container, 'initial import');

    const snapshot = container._state.history[0]?.snapshot;
    const sourceFile = snapshot?.data?.sourceFiles[0];

    expect(snapshot?.manifest?.createdAt).toBeInstanceOf(Date);
    expect(snapshot?.manifest?.updatedAt).toBeInstanceOf(Date);
    expect(sourceFile).toMatchObject({
      id: 'source-1',
      name: 'source.csv',
      duckdbTableName: 'source_table'
    });
    expect(sourceFile).not.toHaveProperty('content');
    expect(sourceFile).not.toHaveProperty('relatedFilesData');
    expect(sourceFile).not.toHaveProperty('parsedData');
    expect(sourceFile).not.toHaveProperty('preparedGeoJSON');
  });

  it('restores undo and redo snapshots with safe metadata only', () => {
    const firstProject = createProject('first', [
      createSourceFile({ id: 'source-1', name: 'first.csv' })
    ]);
    const secondProject = createProject('second', [
      createSourceFile({ id: 'source-2', name: 'second.csv' })
    ]);
    const container = createContainer(firstProject);

    addToHistory(container, 'first import');
    container._state.currentProject = secondProject;
    addToHistory(container, 'second import');

    expect(undo(container)).toBe(true);
    expect(container._state.currentProject?.manifest.name).toBe('first');
    expect(
      container._state.currentProject?.data.sourceFiles[0]
    ).not.toHaveProperty('content');

    expect(redo(container)).toBe(true);
    expect(container._state.currentProject?.manifest.name).toBe('second');
    expect(
      container._state.currentProject?.data.sourceFiles[0]
    ).not.toHaveProperty('relatedFilesData');
  });
});
