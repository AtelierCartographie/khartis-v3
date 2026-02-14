import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';

export type ImportFileLike = Pick<UploadedFile, 'status' | 'validation'>;

const PENDING_IMPORT_STATUSES = new Set<FileStatus>([
  FileStatus.UPLOADING,
  FileStatus.PROCESSING
]);

const BLOCKING_IMPORT_STATUSES = new Set<FileStatus>([
  FileStatus.ERROR,
  FileStatus.INCOMPLETE
]);

function hasFileValidationErrors(file: ImportFileLike): boolean {
  return (file.validation?.errors?.length ?? 0) > 0;
}

export function getValidImportFiles<T extends ImportFileLike>(files: T[]): T[] {
  return files.filter(
    (file) =>
      file.status === FileStatus.COMPLETE && !hasFileValidationErrors(file)
  );
}

export function hasImportValidationErrors(files: ImportFileLike[]): boolean {
  return files.some(hasFileValidationErrors);
}

export function hasBlockingImportFiles(files: ImportFileLike[]): boolean {
  return files.some((file) => BLOCKING_IMPORT_STATUSES.has(file.status));
}

export function hasPendingImportFiles(
  files: ImportFileLike[],
  isProcessingFiles: boolean
): boolean {
  if (isProcessingFiles) {
    return true;
  }

  return files.some((file) => PENDING_IMPORT_STATUSES.has(file.status));
}

export function canSubmitImport(
  files: ImportFileLike[],
  isProcessingFiles: boolean
): boolean {
  if (getValidImportFiles(files).length === 0) {
    return false;
  }

  if (hasPendingImportFiles(files, isProcessingFiles)) {
    return false;
  }

  if (hasImportValidationErrors(files) || hasBlockingImportFiles(files)) {
    return false;
  }

  return true;
}
