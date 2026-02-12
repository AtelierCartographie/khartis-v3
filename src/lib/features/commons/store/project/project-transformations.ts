import { LogCategory, logger } from '../../utils/logger';
import type { ColumnTransformation } from '../create-project.types';
import type { ProjectStateContainer } from './project-state.svelte';
import { getSourceFileIndex } from './project-files';
import { markDirtyAndSave } from './project-persistence';

export async function addColumnTransformation(
  container: ProjectStateContainer,
  fileId: string,
  transformation: ColumnTransformation
): Promise<void> {
  const fileIndex = getSourceFileIndex(container, fileId);
  if (fileIndex === -1) return;

  const project = container._state.currentProject!;
  const file = project.data.sourceFiles[fileIndex];
  const updatedTransformations = [
    ...(file.columnTransformations ?? []),
    transformation
  ];

  const updatedFiles = [...project.data.sourceFiles];
  updatedFiles[fileIndex] = {
    ...file,
    columnTransformations: updatedTransformations
  };

  container._state.currentProject = {
    ...project,
    data: { ...project.data, sourceFiles: updatedFiles }
  };

  await markDirtyAndSave(container);
}

export async function clearColumnTransformations(
  container: ProjectStateContainer,
  fileId: string
): Promise<void> {
  const fileIndex = getSourceFileIndex(container, fileId);
  if (fileIndex === -1) return;

  const project = container._state.currentProject!;
  const updatedFiles = [...project.data.sourceFiles];
  updatedFiles[fileIndex] = {
    ...updatedFiles[fileIndex],
    columnTransformations: [],
    deletedRowIds: []
  };

  container._state.currentProject = {
    ...project,
    data: { ...project.data, sourceFiles: updatedFiles }
  };

  await markDirtyAndSave(container);
}

export async function addDeletedRows(
  container: ProjectStateContainer,
  fileId: string,
  rowIds: number[]
): Promise<void> {
  const fileIndex = getSourceFileIndex(container, fileId);
  if (fileIndex === -1) {
    logger.warn('File not found for adding deleted rows', LogCategory.PROJECT, {
      fileId
    });
    return;
  }

  const project = container._state.currentProject!;
  const file = project.data.sourceFiles[fileIndex];
  const existingDeleted = file.deletedRowIds ?? [];
  const newDeletedIds = [...new Set([...existingDeleted, ...rowIds])];

  logger.info('Adding deleted rows to file', LogCategory.PROJECT, {
    fileId,
    newRowIds: rowIds.length,
    totalDeleted: newDeletedIds.length
  });

  const updatedFiles = [...project.data.sourceFiles];
  updatedFiles[fileIndex] = {
    ...file,
    deletedRowIds: newDeletedIds
  };

  container._state.currentProject = {
    ...project,
    data: { ...project.data, sourceFiles: updatedFiles }
  };

  await markDirtyAndSave(container);
}
