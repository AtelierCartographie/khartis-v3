import { describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { FileType } from '$lib/features/commons/stores/create-project.types';
import {
  getMaxFileSizeForType,
  getWarningFileSizeForType
} from '$lib/features/commons/validation.config';
import { validateFile } from '$lib/features/data-pipeline/core/validators';

function fakeFile(name: string, size: number): File {
  return { name, size, type: 'application/octet-stream' } as File;
}

const CSV_MAX_FILE_SIZE = getMaxFileSizeForType(FileType.CSV);
const CSV_WARNING_FILE_SIZE = getWarningFileSizeForType(FileType.CSV);

describe('validateFile', () => {
  it('rejects unsupported extension', async () => {
    const result = await validateFile(fakeFile('data.exe', 1024));
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      m.pipeline_error_unsupported_extension({ ext: '.exe' })
    ]);
  });

  it('rejects empty files (size = 0)', async () => {
    const result = await validateFile(fakeFile('data.csv', 0));
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([m.pipeline_error_file_empty()]);
  });

  it('rejects files above the per-type size limit', async () => {
    const result = await validateFile(
      fakeFile('data.csv', CSV_MAX_FILE_SIZE + 1)
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      m.pipeline_error_file_size_limit({
        limit: String(CSV_MAX_FILE_SIZE / (1024 * 1024))
      })
    ]);
  });

  it('accepts files above the warning threshold but below the max with a warning', async () => {
    const result = await validateFile(
      fakeFile('data.csv', CSV_WARNING_FILE_SIZE + 1)
    );
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('accepts a normal file without errors or warnings', async () => {
    const result = await validateFile(fakeFile('data.csv', 1024 * 1024));
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
