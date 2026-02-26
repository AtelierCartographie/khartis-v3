import { describe, expect, it } from 'vitest';

import * as m from '$lib/paraglide/messages';
import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
import { validateFile } from '$lib/features/data-pipeline/core/validators';

function fakeFile(name: string, size: number): File {
  return { name, size, type: 'application/octet-stream' } as File;
}

describe('validateFile', () => {
  it('rejects unsupported extension', async () => {
    const result = await validateFile(fakeFile('data.exe', 1024));

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      m.pipeline_error_unsupported_extension({ ext: '.exe' })
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects empty files', async () => {
    const result = await validateFile(fakeFile('data.csv', 0));

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([m.pipeline_error_file_empty()]);
  });

  it('rejects files above max size', async () => {
    const result = await validateFile(
      fakeFile('data.csv', PIPELINE_CONST.LIMITS.MAX_FILE_SIZE + 1)
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      m.pipeline_error_file_size_limit({
        limit: String(PIPELINE_CONST.LIMITS.MAX_FILE_SIZE / (1024 * 1024))
      })
    ]);
  });

  it('accepts large files under max size with a warning', async () => {
    const size = PIPELINE_CONST.LIMITS.WARNING_FILE_SIZE + 1;
    const result = await validateFile(fakeFile('data.csv', size));

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      m.pipeline_warning_large_file({
        size: (size / (1024 * 1024)).toFixed(1)
      })
    ]);
  });

  it('accepts normal supported files without warnings', async () => {
    const result = await validateFile(fakeFile('data.geojson', 1024));

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
