import { describe, expect, it, vi } from 'vitest';
import { canSubmitImport } from '$lib/features/create-project/services/import-readiness.service';
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
