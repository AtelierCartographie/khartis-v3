import { describe, expect, it, vi } from 'vitest';
import {
  deserializeUploadedFile,
  serializeUploadedFile
} from '$lib/features/project-management/core/file-serializer';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  LogCategory: { PERSISTENCE: 'PERSISTENCE', DATA: 'DATA', PROJECT: 'PROJECT' }
}));

function minimalFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    name: 'data.csv',
    size: 512,
    type: 'text/csv',
    fileType: 'CSV',
    status: 'ready',
    uploadProgress: 100,
    sourceType: 'local',
    ...overrides
  } as never;
}

describe('serializeUploadedFile — asset refs', () => {
  it('persists asset refs and omits inline content', () => {
    const file = minimalFile({
      content: 'col1,col2\n1,2',
      assetRef: {
        assetId: 'asset-1',
        originalName: 'data.csv',
        mimeType: 'text/csv',
        size: 12,
        kind: 'primary'
      }
    });
    const serialized = serializeUploadedFile(file);
    expect(serialized.assetRef?.assetId).toBe('asset-1');
    expect(
      (serialized as unknown as Record<string, unknown>).content
    ).toBeUndefined();
  });

  it('persists companion asset refs for multi-file sources', () => {
    const serialized = serializeUploadedFile(
      minimalFile({
        companionAssetRefs: [
          {
            assetId: 'asset-2',
            originalName: 'data.dbf',
            mimeType: 'application/octet-stream',
            size: 42,
            kind: 'companion'
          }
        ]
      })
    );
    expect(serialized.companionAssetRefs).toHaveLength(1);
    expect(serialized.companionAssetRefs?.[0]?.originalName).toBe('data.dbf');
  });
});

describe('serializeUploadedFile — optional fields', () => {
  it('includes columnTransformations only when non-empty', () => {
    const withoutTransformations = serializeUploadedFile(
      minimalFile({ columnTransformations: [] })
    );
    expect(withoutTransformations.columnTransformations).toBeUndefined();

    const withTransformations = serializeUploadedFile(
      minimalFile({
        columnTransformations: [{ type: 'rename', oldName: 'a', newName: 'b' }]
      })
    );
    expect(withTransformations.columnTransformations).toHaveLength(1);
  });

  it('includes duckdbTableName when set', () => {
    const serialized = serializeUploadedFile(
      minimalFile({ duckdbTableName: 'tbl_xyz' })
    );
    expect(serialized.duckdbTableName).toBe('tbl_xyz');
  });
});

describe('deserializeUploadedFile — asset ref round-trip', () => {
  it('restores persisted asset references', () => {
    const serialized = serializeUploadedFile(
      minimalFile({
        assetRef: {
          assetId: 'asset-1',
          originalName: 'hello.csv',
          mimeType: 'text/csv',
          size: 11,
          kind: 'primary'
        },
        companionAssetRefs: [
          {
            assetId: 'asset-2',
            originalName: 'hello.dbf',
            mimeType: 'application/octet-stream',
            size: 7,
            kind: 'companion'
          }
        ]
      })
    );
    const restored = deserializeUploadedFile(serialized);
    expect(restored.assetRef?.assetId).toBe('asset-1');
    expect(restored.companionAssetRefs?.[0]?.assetId).toBe('asset-2');
    expect(restored.content).toBeUndefined();
  });
});
