import type { UploadedFile } from '$lib/features/commons/types/create-project.types';

export interface PipelineFileErrorContext {
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileExtension?: string;
  fileStatus?: string;
  fileSourceType?: string;
  datasetId?: string;
  duckdbTableName?: string;
  joinedBasemap?: string;
  errorMessageFromFile?: string;
}

function extractFileExtension(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

export function buildFileErrorContext(
  file: Partial<UploadedFile> | null | undefined,
  overrides: Record<string, unknown> = {}
): PipelineFileErrorContext & Record<string, unknown> {
  if (!file) return { ...overrides };

  return {
    fileId: file.id,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    fileExtension: extractFileExtension(file.name),
    fileStatus: file.status as string | undefined,
    fileSourceType: file.sourceType as string | undefined,
    duckdbTableName: file.duckdbTableName,
    joinedBasemap: file.joinedBasemap,
    errorMessageFromFile: file.errorMessage,
    ...overrides
  };
}
