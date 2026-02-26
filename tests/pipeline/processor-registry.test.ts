import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileType } from '$lib/features/commons/store/create-project.types';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import type { FileProcessor } from '$lib/features/data-pipeline/processors/file-processor.interface';

function uploaded(name: string, fileType: FileType): UploadedFile {
  return {
    id: 'f1',
    name,
    size: 10,
    type: 'application/octet-stream',
    fileType,
    status: 'complete',
    sourceType: 'file_upload'
  } as UploadedFile;
}

function processor(canHandle: (file: UploadedFile) => boolean): FileProcessor {
  return {
    supportedFileTypes: [FileType.UNKNOWN],
    canHandle,
    process: vi.fn()
  } as unknown as FileProcessor;
}

describe('processor-registry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null/false when no processor matches', async () => {
    const mod =
      await import('$lib/features/data-pipeline/processors/processor-registry');

    const file = uploaded('data.csv', FileType.CSV);
    expect(mod.getProcessor(file)).toBeNull();
    expect(mod.hasProcessor(file)).toBe(false);
  });

  it('returns processor with highest priority among matching ones', async () => {
    const mod =
      await import('$lib/features/data-pipeline/processors/processor-registry');

    const low = processor(() => true);
    const high = processor(() => true);

    mod.registerProcessor(low, 1);
    mod.registerProcessor(high, 10);

    const file = uploaded('data.csv', FileType.CSV);
    expect(mod.getProcessor(file)).toBe(high);
    expect(mod.hasProcessor(file)).toBe(true);
  });

  it('skips non-matching processor and returns later match', async () => {
    const mod =
      await import('$lib/features/data-pipeline/processors/processor-registry');

    const first = processor(() => false);
    const second = processor((file) => file.name.endsWith('.geojson'));

    mod.registerProcessor(first, 100);
    mod.registerProcessor(second, 1);

    const file = uploaded('map.geojson', FileType.GEOJSON);
    expect(mod.getProcessor(file)).toBe(second);
  });
});
