import { describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
import { validateFile } from '$lib/features/data-pipeline/core/validators';

function fakeFile(name: string, size: number): File {
  return { name, size, type: 'application/octet-stream' } as File;
}

const { MAX_FILE_SIZE, WARNING_FILE_SIZE } = PIPELINE_CONST.LIMITS;

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

  it('rejects files above 100 MB', async () => {
    const result = await validateFile(fakeFile('data.csv', MAX_FILE_SIZE + 1));
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      m.pipeline_error_file_size_limit({
        limit: String(MAX_FILE_SIZE / (1024 * 1024))
      })
    ]);
  });

  it('accepts files above 50 MB but below 100 MB with a warning', async () => {
    const result = await validateFile(
      fakeFile('data.csv', WARNING_FILE_SIZE + 1)
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
