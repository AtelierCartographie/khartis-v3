import * as m from '$lib/paraglide/messages';
import { dataOrchestratorService } from '../../services/data-orchestrator.service.svelte';
import { LogCategory, logger } from '../../utils/logger';
import type { UploadedFile } from '../../types/create-project.types';
import type { ProjectStateContainer } from './project-state.svelte';
import { markDirtyAndSave } from './project-persistence';

export function getSourceFileIndex(
  container: ProjectStateContainer,
  fileId: string
): number {
  if (!container._state.currentProject?.data?.sourceFiles) {
    return -1;
  }
  return container._state.currentProject.data.sourceFiles.findIndex(
    (f) => f.id === fileId
  );
}

export function cleanFileForStorage(file: UploadedFile): UploadedFile {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.type,
    fileType: file.fileType,
    status: file.status,
    uploadProgress: file.uploadProgress,
    errorMessage: file.errorMessage,
    validation: file.validation,
    parsedData: file.parsedData,
    content: file.content,
    preparedGeoJSON: file.preparedGeoJSON,
    duplicates: file.duplicates,
    statistics: file.statistics,
    sourceType: file.sourceType,
    deepAnalysis: file.deepAnalysis,
    geoMatchResult: file.geoMatchResult,
    relatedFiles: file.relatedFiles,
    assetRef: file.assetRef,
    companionAssetRefs: file.companionAssetRefs,
    relatedFilesData: file.relatedFilesData,
    columnTransformations: file.columnTransformations,
    deletedRowIds: file.deletedRowIds,
    joinedBasemap: file.joinedBasemap,
    geoColumn: file.geoColumn,
    gpsMode: file.gpsMode,
    gpsColumns: file.gpsColumns,
    duckdbTableName: file.duckdbTableName,
    sourceArchive: file.sourceArchive,
    shapefileBaseName: file.shapefileBaseName,
    missingShapefileComponents: file.missingShapefileComponents,
    isVirtualCopy: file.isVirtualCopy,
    originalSourceFileId: file.originalSourceFileId,
    datasetId: file.datasetId
  };
}

export async function addFilesToProject(
  container: ProjectStateContainer,
  newFiles: UploadedFile[]
): Promise<void> {
  if (!container._state.currentProject) {
    throw new Error(m.history_no_project_loaded());
  }

  if (!container._state.currentProject.data) {
    container._state.currentProject.data = { sourceFiles: [] };
  }

  if (!container._state.currentProject.data.sourceFiles) {
    container._state.currentProject.data.sourceFiles = [];
  }

  for (const file of newFiles) {
    const exists = container._state.currentProject.data.sourceFiles.find(
      (f) => f.id === file.id || f.name === file.name
    );
    if (!exists) {
      const fileCopy = cleanFileForStorage(file);

      container._state.currentProject = {
        ...container._state.currentProject,
        data: {
          ...container._state.currentProject.data,
          sourceFiles: [
            ...container._state.currentProject.data.sourceFiles,
            fileCopy
          ]
        }
      };

      try {
        await dataOrchestratorService.onFileAdded(fileCopy);
      } catch (error) {
        logger.error('Failed to process file', LogCategory.PROJECT, error);

        container._state.currentProject = {
          ...container._state.currentProject,
          data: {
            ...container._state.currentProject.data,
            sourceFiles:
              container._state.currentProject.data.sourceFiles.filter(
                (f) => f.id !== fileCopy.id
              )
          }
        };

        throw error;
      }
    }
  }

  await markDirtyAndSave(container);
}

export function addVirtualSourceFile(
  container: ProjectStateContainer,
  file: UploadedFile
): void {
  if (!container._state.currentProject?.data) {
    return;
  }

  if (!container._state.currentProject.data.sourceFiles) {
    container._state.currentProject.data.sourceFiles = [];
  }

  container._state.currentProject = {
    ...container._state.currentProject,
    data: {
      ...container._state.currentProject.data,
      sourceFiles: [...container._state.currentProject.data.sourceFiles, file]
    }
  };
}

export async function removeFileFromProject(
  container: ProjectStateContainer,
  fileId: string
): Promise<void> {
  if (!container._state.currentProject?.data?.sourceFiles) {
    return;
  }

  container._state.currentProject = {
    ...container._state.currentProject,
    data: {
      ...container._state.currentProject.data,
      sourceFiles: container._state.currentProject.data.sourceFiles.filter(
        (f) => f.id !== fileId
      )
    }
  };

  await dataOrchestratorService.onFileRemoved(fileId);

  await markDirtyAndSave(container);
}

export async function renameFile(
  container: ProjectStateContainer,
  fileId: string,
  newName: string
): Promise<void> {
  const fileIndex = getSourceFileIndex(container, fileId);
  if (fileIndex === -1) return;

  const project = container._state.currentProject!;
  const currentFile = project.data.sourceFiles[fileIndex];
  const oldName = currentFile.name;

  const getBaseName = (fileName: string) => {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  };

  const oldBaseName = getBaseName(oldName);
  const newBaseName = getBaseName(newName);

  const updatedFiles = [...project.data.sourceFiles];
  const updatedFile = { ...updatedFiles[fileIndex], name: newName };

  if (updatedFile.relatedFilesData && oldBaseName !== newBaseName) {
    const renamedData: Record<string, ArrayBuffer> = {};
    for (const [fileName, buffer] of Object.entries(
      updatedFile.relatedFilesData
    )) {
      const fileBaseName = getBaseName(fileName);
      const fileExt = fileName.slice(fileBaseName.length);
      if (fileBaseName.toLowerCase() === oldBaseName.toLowerCase()) {
        renamedData[newBaseName + fileExt] = buffer;
      } else {
        renamedData[fileName] = buffer;
      }
    }
    updatedFile.relatedFilesData = renamedData;
  }

  if (updatedFile.relatedFiles && oldBaseName !== newBaseName) {
    updatedFile.relatedFiles = updatedFile.relatedFiles.map((fileName) => {
      const fileBaseName = getBaseName(fileName);
      const fileExt = fileName.slice(fileBaseName.length);
      if (fileBaseName.toLowerCase() === oldBaseName.toLowerCase()) {
        return newBaseName + fileExt;
      }
      return fileName;
    });
  }

  if (updatedFile.assetRef) {
    updatedFile.assetRef = {
      ...updatedFile.assetRef,
      originalName: newName
    };
  }

  if (updatedFile.companionAssetRefs && oldBaseName !== newBaseName) {
    updatedFile.companionAssetRefs = updatedFile.companionAssetRefs.map(
      (assetRef) => {
        const companionBaseName = getBaseName(assetRef.originalName);
        const companionExt = assetRef.originalName.slice(
          companionBaseName.length
        );

        if (companionBaseName.toLowerCase() === oldBaseName.toLowerCase()) {
          return {
            ...assetRef,
            originalName: `${newBaseName}${companionExt}`
          };
        }

        return assetRef;
      }
    );
  }

  updatedFiles[fileIndex] = updatedFile;

  container._state.currentProject = {
    ...project,
    data: { ...project.data, sourceFiles: updatedFiles }
  };

  await markDirtyAndSave(container);
}
