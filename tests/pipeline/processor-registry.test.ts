import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import type { FileProcessor } from '$lib/features/data-pipeline/processors/file-processor.interface';

function uploaded(name: string, fileType: FileType): UploadedFile {
  return {
    id: 'f1',
    name,
    size: 10,
    type: '',
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

  it('returns null when no processor is registered', async () => {
    const mod =
      await import('$lib/features/data-pipeline/processors/processor-registry');
    expect(mod.getProcessor(uploaded('data.csv', FileType.CSV))).toBeNull();
  });

  it('returns the first matching processor in registration order', async () => {
    const mod =
      await import('$lib/features/data-pipeline/processors/processor-registry');
    const first = processor(() => true);
    const second = processor(() => true);
    mod.registerProcessor(first);
    mod.registerProcessor(second);
    expect(mod.getProcessor(uploaded('data.csv', FileType.CSV))).toBe(first);
  });

  it('skips processors that cannot handle the file', async () => {
    const mod =
      await import('$lib/features/data-pipeline/processors/processor-registry');
    const csv = processor((f) => f.fileType === FileType.CSV);
    const geo = processor((f) => f.fileType === FileType.GEOJSON);
    mod.registerProcessor(csv);
    mod.registerProcessor(geo);
    expect(mod.getProcessor(uploaded('data.csv', FileType.CSV))).toBe(csv);
    expect(mod.getProcessor(uploaded('geo.geojson', FileType.GEOJSON))).toBe(
      geo
    );
  });
});
