import { LogCategory, logger } from '../../utils/logger';
import type { ColumnTransformation } from '../create-project.types';
import type { ProjectStateContainer } from './project-state.svelte';
import { saveCurrentProject } from './project-persistence';

export async function addColumnTransformation(
  container: ProjectStateContainer,
  fileId: string,
  transformation: ColumnTransformation
): Promise<void> {
  if (!container._state.currentProject?.data?.sourceFiles) {
    return;
  }

  const fileIndex = container._state.currentProject.data.sourceFiles.findIndex(
    (f) => f.id === fileId
  );

  if (fileIndex === -1) {
    return;
  }

  const file = container._state.currentProject.data.sourceFiles[fileIndex];
  const updatedTransformations = [
    ...(file.columnTransformations ?? []),
    transformation
  ];

  const updatedFiles = [...container._state.currentProject.data.sourceFiles];
  updatedFiles[fileIndex] = {
    ...file,
    columnTransformations: updatedTransformations
  };

  container._state.currentProject = {
    ...container._state.currentProject,
    data: {
      ...container._state.currentProject.data,
      sourceFiles: updatedFiles
    }
  };

  container._state.isDirty = true;
  await saveCurrentProject(container);
}

export async function clearColumnTransformations(
  container: ProjectStateContainer,
  fileId: string
): Promise<void> {
  if (!container._state.currentProject?.data?.sourceFiles) {
    return;
  }

  const fileIndex = container._state.currentProject.data.sourceFiles.findIndex(
    (f) => f.id === fileId
  );

  if (fileIndex === -1) {
    return;
  }

  const updatedFiles = [...container._state.currentProject.data.sourceFiles];
  updatedFiles[fileIndex] = {
    ...updatedFiles[fileIndex],
    columnTransformations: [],
    deletedRowIds: []
  };

  container._state.currentProject = {
    ...container._state.currentProject,
    data: {
      ...container._state.currentProject.data,
      sourceFiles: updatedFiles
    }
  };

  container._state.isDirty = true;
  await saveCurrentProject(container);
}

export async function addDeletedRows(
  container: ProjectStateContainer,
  fileId: string,
  rowIds: number[]
): Promise<void> {
  if (!container._state.currentProject?.data?.sourceFiles) {
    logger.warn(
      'No project or source files to add deleted rows',
      LogCategory.PROJECT
    );
    return;
  }

  const fileIndex = container._state.currentProject.data.sourceFiles.findIndex(
    (f) => f.id === fileId
  );

  if (fileIndex === -1) {
    logger.warn('File not found for adding deleted rows', LogCategory.PROJECT, {
      fileId,
      availableFileIds: container._state.currentProject.data.sourceFiles.map(
        (f) => f.id
      )
    });
    return;
  }

  const file = container._state.currentProject.data.sourceFiles[fileIndex];
  const existingDeleted = file.deletedRowIds ?? [];
  const newDeletedIds = [...new Set([...existingDeleted, ...rowIds])];

  logger.info('Adding deleted rows to file', LogCategory.PROJECT, {
    fileId,
    newRowIds: rowIds.length,
    totalDeleted: newDeletedIds.length
  });

  const updatedFiles = [...container._state.currentProject.data.sourceFiles];
  updatedFiles[fileIndex] = {
    ...file,
    deletedRowIds: newDeletedIds
  };

  container._state.currentProject = {
    ...container._state.currentProject,
    data: {
      ...container._state.currentProject.data,
      sourceFiles: updatedFiles
    }
  };

  container._state.isDirty = true;
  await saveCurrentProject(container);
}
