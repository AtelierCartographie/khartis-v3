import { describe, expect, it, vi } from 'vitest';
import {
  getValidImportFiles,
  hasImportValidationErrors,
  hasBlockingImportFiles,
  hasPendingImportFiles,
  canSubmitImport
} from '$lib/features/create-project/services/import-readiness.service';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  LogCategory: { FILE: 'FILE' }
}));

function file(status: FileStatus, validationErrors: string[] = []) {
  return {
    status,
    validation:
      validationErrors.length > 0
        ? { errors: validationErrors, isValid: false, warnings: [] }
        : undefined
  };
}

// ─── getValidImportFiles ───────────────────────────────────────────────────

describe('getValidImportFiles', () => {
  it('returns only COMPLETE files with no validation errors', () => {
    const files = [
      file(FileStatus.COMPLETE),
      file(FileStatus.ERROR),
      file(FileStatus.COMPLETE, ['bad field'])
    ];
    const result = getValidImportFiles(files);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(FileStatus.COMPLETE);
  });

  it('returns empty array when all files are invalid', () => {
    expect(getValidImportFiles([file(FileStatus.ERROR)])).toHaveLength(0);
  });

  it('returns all files when all are COMPLETE with no errors', () => {
    const files = [file(FileStatus.COMPLETE), file(FileStatus.COMPLETE)];
    expect(getValidImportFiles(files)).toHaveLength(2);
  });
});

// ─── hasImportValidationErrors ─────────────────────────────────────────────

describe('hasImportValidationErrors', () => {
  it('returns true when any file has validation errors', () => {
    expect(
      hasImportValidationErrors([
        file(FileStatus.COMPLETE),
        file(FileStatus.COMPLETE, ['err'])
      ])
    ).toBe(true);
  });

  it('returns false when no file has validation errors', () => {
    expect(
      hasImportValidationErrors([
        file(FileStatus.COMPLETE),
        file(FileStatus.ERROR)
      ])
    ).toBe(false);
  });

  it('returns false for empty list', () => {
    expect(hasImportValidationErrors([])).toBe(false);
  });
});

// ─── hasBlockingImportFiles ────────────────────────────────────────────────

describe('hasBlockingImportFiles', () => {
  it('returns true for ERROR status', () => {
    expect(hasBlockingImportFiles([file(FileStatus.ERROR)])).toBe(true);
  });

  it('returns true for INCOMPLETE status', () => {
    expect(hasBlockingImportFiles([file(FileStatus.INCOMPLETE)])).toBe(true);
  });

  it('returns false for COMPLETE status', () => {
    expect(hasBlockingImportFiles([file(FileStatus.COMPLETE)])).toBe(false);
  });

  it('returns false for PROCESSING or UPLOADING status', () => {
    expect(hasBlockingImportFiles([file(FileStatus.PROCESSING)])).toBe(false);
    expect(hasBlockingImportFiles([file(FileStatus.UPLOADING)])).toBe(false);
  });
});

// ─── hasPendingImportFiles ─────────────────────────────────────────────────

describe('hasPendingImportFiles', () => {
  it('returns true when isProcessingFiles is true regardless of file statuses', () => {
    expect(hasPendingImportFiles([file(FileStatus.COMPLETE)], true)).toBe(true);
  });

  it('returns true when any file is UPLOADING', () => {
    expect(hasPendingImportFiles([file(FileStatus.UPLOADING)], false)).toBe(
      true
    );
  });

  it('returns true when any file is PROCESSING', () => {
    expect(hasPendingImportFiles([file(FileStatus.PROCESSING)], false)).toBe(
      true
    );
  });

  it('returns false when no file is pending and isProcessingFiles is false', () => {
    expect(hasPendingImportFiles([file(FileStatus.COMPLETE)], false)).toBe(
      false
    );
  });
});

// ─── canSubmitImport ───────────────────────────────────────────────────────

describe('canSubmitImport', () => {
  it('returns true when all conditions are met', () => {
    expect(canSubmitImport([file(FileStatus.COMPLETE)], false)).toBe(true);
  });

  it('returns false when there are no valid files', () => {
    expect(canSubmitImport([file(FileStatus.ERROR)], false)).toBe(false);
  });

  it('returns false when files are still pending', () => {
    const files = [file(FileStatus.COMPLETE), file(FileStatus.PROCESSING)];
    expect(canSubmitImport(files, false)).toBe(false);
  });

  it('returns false when isProcessingFiles is true', () => {
    expect(canSubmitImport([file(FileStatus.COMPLETE)], true)).toBe(false);
  });

  it('returns false when a file has validation errors', () => {
    const files = [
      file(FileStatus.COMPLETE),
      file(FileStatus.COMPLETE, ['err'])
    ];
    expect(canSubmitImport(files, false)).toBe(false);
  });

  it('returns false when a file is in INCOMPLETE status', () => {
    const files = [file(FileStatus.COMPLETE), file(FileStatus.INCOMPLETE)];
    expect(canSubmitImport(files, false)).toBe(false);
  });
});
