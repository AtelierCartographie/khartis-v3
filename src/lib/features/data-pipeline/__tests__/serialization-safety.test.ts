import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  serializeUploadedFile,
  deserializeUploadedFile
} from '../../project-management/core/file-serializer';
import { deepCloneForStorage } from '../../commons/utils/clone-for-storage.utils';
import { estimateProjectStorageSize } from '../../commons/utils/size-estimation.utils';
import {
  DataSourceType,
  type UploadedFile
} from '../../commons/store/create-project.types';
import type { SerializedUploadedFile } from '$lib/types/serialization.types';

const ROOT = join(process.cwd(), 'tests-datasets');
const LARGE_SHP = join(
  ROOT,
  'shp/mos_foncier_agrege_com/mos_foncier_agrege_com.shp'
);

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer;
}

function mockUploadedFile(content: ArrayBuffer): UploadedFile {
  return {
    id: 'test-file',
    name: 'test.shp',
    size: content.byteLength,
    type: 'application/octet-stream',
    fileType: 'shapefile',
    status: 'complete',
    sourceType: DataSourceType.FILE_UPLOAD,
    content
  } as UploadedFile;
}

function mockUploadedFileWithRelated(
  mainBuffer: ArrayBuffer,
  relatedBuffers: Record<string, ArrayBuffer>
): UploadedFile {
  return {
    id: 'test-file-related',
    name: 'test.shp',
    size: mainBuffer.byteLength,
    type: 'application/octet-stream',
    fileType: 'shapefile',
    status: 'complete',
    sourceType: DataSourceType.FILE_UPLOAD,
    content: mainBuffer,
    relatedFiles: Object.keys(relatedBuffers),
    relatedFilesData: relatedBuffers
  } as UploadedFile;
}

describe('Serialization safety', { timeout: 120_000 }, () => {
  it('should serialize and round-trip large binary file without crash', () => {
    const nodeBuffer = readFileSync(LARGE_SHP);
    const arrayBuffer = bufferToArrayBuffer(nodeBuffer);
    const file = mockUploadedFile(arrayBuffer);

    const serialized = serializeUploadedFile(file, {
      preserveBinary: true
    });

    // Avoid passing large binary buffers directly to expect() — Vitest
    // tries to format them for potential error messages, which hangs on 80+ MB.
    expect(serialized.content instanceof Uint8Array).toBe(true);
    expect(serialized.contentType).toBe('arraybuffer');
    expect((serialized.content as Uint8Array).byteLength).toBe(
      arrayBuffer.byteLength
    );

    const cloned = deepCloneForStorage(serialized) as SerializedUploadedFile;

    expect(cloned.content instanceof Uint8Array).toBe(true);
    expect((cloned.content as Uint8Array).byteLength).toBe(
      arrayBuffer.byteLength
    );
    expect(cloned.content !== serialized.content).toBe(true);

    const restored = deserializeUploadedFile(cloned);

    expect(restored.content instanceof ArrayBuffer).toBe(true);
    expect((restored.content as ArrayBuffer).byteLength).toBe(
      arrayBuffer.byteLength
    );
  });

  it('should serialize without preserveBinary (legacy number[] format)', () => {
    const smallBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer as ArrayBuffer;
    const file = mockUploadedFile(smallBuffer);

    const serialized = serializeUploadedFile(file);

    expect(Array.isArray(serialized.content)).toBe(true);
    expect(serialized.contentType).toBe('arraybuffer');
    expect(serialized.content).toEqual([1, 2, 3, 4, 5]);
  });

  it('should serialize and clone relatedFilesData with preserveBinary', () => {
    const mainBuffer = new Uint8Array([10, 20, 30]).buffer as ArrayBuffer;
    const relatedBuffers = {
      'test.dbf': new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer,
      'test.shx': new Uint8Array([5, 6, 7, 8]).buffer as ArrayBuffer
    };
    const file = mockUploadedFileWithRelated(mainBuffer, relatedBuffers);

    const serialized = serializeUploadedFile(file, {
      preserveBinary: true
    });
    expect(serialized.relatedFilesData!['test.dbf']).toBeInstanceOf(Uint8Array);
    expect(serialized.relatedFilesData!['test.shx']).toBeInstanceOf(Uint8Array);

    const cloned = deepCloneForStorage(serialized) as SerializedUploadedFile;
    const restored = deserializeUploadedFile(cloned);

    expect(restored.relatedFilesData!['test.dbf']).toBeInstanceOf(ArrayBuffer);
    expect(
      (restored.relatedFilesData!['test.dbf'] as ArrayBuffer).byteLength
    ).toBe(4);
    expect(restored.relatedFilesData!['test.shx']).toBeInstanceOf(ArrayBuffer);
    expect(
      (restored.relatedFilesData!['test.shx'] as ArrayBuffer).byteLength
    ).toBe(4);
  });

  it('should deserialize legacy number[] format (backward compat)', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const legacy: SerializedUploadedFile = {
      id: 'test',
      name: 'test.bin',
      size: 5,
      type: 'application/octet-stream',
      fileType: 'unknown',
      status: 'complete',
      content: Array.from(original),
      contentType: 'arraybuffer'
    };

    const restored = deserializeUploadedFile(legacy);

    expect(restored.content).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(restored.content as ArrayBuffer)).toEqual(original);
  });

  it('should deserialize legacy number[] relatedFilesData (backward compat)', () => {
    const legacy: SerializedUploadedFile = {
      id: 'test',
      name: 'test.shp',
      size: 100,
      type: 'application/octet-stream',
      fileType: 'shapefile',
      status: 'complete',
      relatedFilesData: {
        'test.dbf': [10, 20, 30] as unknown as number[],
        'test.shx': [40, 50, 60] as unknown as number[]
      }
    };

    const restored = deserializeUploadedFile(legacy);

    expect(restored.relatedFilesData!['test.dbf']).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(restored.relatedFilesData!['test.dbf'])).toEqual(
      new Uint8Array([10, 20, 30])
    );
  });

  it('should convert BigInt to Number during deepCloneForStorage', () => {
    const obj = {
      count: BigInt(42),
      name: 'test',
      nested: {
        value: BigInt(999),
        items: [BigInt(1), BigInt(2), BigInt(3)]
      }
    };

    const cloned = deepCloneForStorage(obj) as Record<string, unknown>;

    expect(cloned.count).toBe(42);
    expect(typeof cloned.count).toBe('number');
    expect(cloned.name).toBe('test');
    const nested = cloned.nested as Record<string, unknown>;
    expect(nested.value).toBe(999);
    expect(typeof nested.value).toBe('number');
    expect(nested.items).toEqual([1, 2, 3]);
  });

  it('should estimate project size correctly for binary files', () => {
    const content = new ArrayBuffer(10_000);
    const file = mockUploadedFile(content);

    const estimated = estimateProjectStorageSize({
      data: { sourceFiles: [file] }
    });

    expect(estimated).toBeGreaterThanOrEqual(10_000);
  });

  it('should estimate project size for files with relatedFilesData', () => {
    const mainBuffer = new Uint8Array(1000).buffer as ArrayBuffer;
    const relatedBuffers = {
      'test.dbf': new Uint8Array(500).buffer as ArrayBuffer,
      'test.shx': new Uint8Array(300).buffer as ArrayBuffer
    };
    const file = mockUploadedFileWithRelated(mainBuffer, relatedBuffers);

    const estimated = estimateProjectStorageSize({
      data: { sourceFiles: [file] }
    });

    expect(estimated).toBeGreaterThanOrEqual(1800);
  });
});
