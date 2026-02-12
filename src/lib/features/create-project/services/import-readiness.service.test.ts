import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import { describe, expect, it } from 'vitest';
import {
  canSubmitImport,
  getValidImportFiles,
  hasBlockingImportFiles,
  hasImportValidationErrors,
  hasPendingImportFiles,
  type ImportFileLike
} from './import-readiness.service';

function createFile(
  status: FileStatus,
  validationErrors: string[] = []
): ImportFileLike {
  if (validationErrors.length === 0) {
    return { status };
  }

  return {
    status,
    validation: {
      isValid: false,
      errors: validationErrors,
      warnings: []
    }
  };
}

describe('import-readiness.service', () => {
  it('keeps only complete files without validation errors as valid import files', () => {
    const files: ImportFileLike[] = [
      createFile(FileStatus.COMPLETE),
      createFile(FileStatus.COMPLETE, ['invalid header']),
      createFile(FileStatus.ERROR),
      createFile(FileStatus.PROCESSING)
    ];

    const valid = getValidImportFiles(files);

    expect(valid).toHaveLength(1);
    expect(valid[0]?.status).toBe(FileStatus.COMPLETE);
  });

  it('detects pending files from both store processing flag and file statuses', () => {
    expect(hasPendingImportFiles([createFile(FileStatus.COMPLETE)], true)).toBe(
      true
    );
    expect(
      hasPendingImportFiles([createFile(FileStatus.UPLOADING)], false)
    ).toBe(true);
    expect(
      hasPendingImportFiles([createFile(FileStatus.PROCESSING)], false)
    ).toBe(true);
    expect(
      hasPendingImportFiles([createFile(FileStatus.COMPLETE)], false)
    ).toBe(false);
  });

  it('detects blocking states and validation errors', () => {
    expect(hasBlockingImportFiles([createFile(FileStatus.ERROR)])).toBe(true);
    expect(hasBlockingImportFiles([createFile(FileStatus.INCOMPLETE)])).toBe(
      true
    );
    expect(hasBlockingImportFiles([createFile(FileStatus.COMPLETE)])).toBe(
      false
    );

    expect(
      hasImportValidationErrors([
        createFile(FileStatus.COMPLETE, ['bad column'])
      ])
    ).toBe(true);
    expect(hasImportValidationErrors([createFile(FileStatus.COMPLETE)])).toBe(
      false
    );
  });

  it('allows submit only when all import conditions are satisfied', () => {
    expect(canSubmitImport([createFile(FileStatus.COMPLETE)], false)).toBe(
      true
    );

    expect(
      canSubmitImport(
        [createFile(FileStatus.COMPLETE), createFile(FileStatus.ERROR)],
        false
      )
    ).toBe(false);

    expect(canSubmitImport([createFile(FileStatus.COMPLETE)], true)).toBe(
      false
    );

    expect(
      canSubmitImport([createFile(FileStatus.COMPLETE, ['invalid'])], false)
    ).toBe(false);

    expect(canSubmitImport([], false)).toBe(false);
  });
});
