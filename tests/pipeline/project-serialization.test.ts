import { describe, expect, it, vi } from 'vitest';
import { migrateIfNeeded } from '$lib/features/project-management/core/schema-migration';
import {
  serializeUploadedFile,
  deserializeUploadedFile
} from '$lib/features/project-management/core/file-serializer';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  LogCategory: { PERSISTENCE: 'PERSISTENCE', DATA: 'DATA', PROJECT: 'PROJECT' }
}));

// ─── migrateIfNeeded ───────────────────────────────────────────────────────

describe('migrateIfNeeded', () => {
  it('is a no-op when manifest version is already current (3.2.0)', () => {
    const data = { manifest: { version: '3.2.0' }, settings: { value: 42 } };
    const result = migrateIfNeeded(data);
    expect(result.settings).toEqual({ value: 42 });
    expect((result.manifest as { version: string }).version).toBe('3.2.0');
  });

  it('stamps APP_VERSION when no migration runs (no-op path)', () => {
    const data = { manifest: { version: '3.2.0', extra: 'preserved' } };
    const result = migrateIfNeeded(data);
    expect((result.manifest as Record<string, unknown>).extra).toBe(
      'preserved'
    );
    expect((result.manifest as { version: string }).version).toBe('3.2.0');
  });

  it('applies the 3.0.0→3.1.0 migration — data is transformed', () => {
    const data = {
      manifest: { version: '3.0.0' },
      visualizationSettings: [{ symbols: { type: 'point' } }]
    };
    const result = migrateIfNeeded(data);
    const viz = (
      result.visualizationSettings as { symbols: { type: string } }[]
    )[0];
    expect(viz.symbols.type).toBe('circle');
  });

  it('applies the 3.1.0→3.2.0 migration — data is transformed', () => {
    const data = {
      manifest: { version: '3.1.0' },
      visualizationSettings: [{ symbols: { type: 'point' } }]
    };
    const result = migrateIfNeeded(data);
    const viz = (
      result.visualizationSettings as { symbols: { type: string } }[]
    )[0];
    expect(viz.symbols.type).toBe('circle');
  });

  it('runs both migrations in chain for 3.0.0 input', () => {
    const data = {
      manifest: { version: '3.0.0' },
      visualizationSettings: [
        { symbols: { type: 'point' } },
        { symbols: { type: 'square' } }
      ]
    };
    const result = migrateIfNeeded(data);
    const vizs = result.visualizationSettings as {
      symbols: { type: string };
    }[];
    expect(vizs[0].symbols.type).toBe('circle');
    expect(vizs[1].symbols.type).toBe('square');
  });
});

describe('migrateIfNeeded — remapLegacyPointShape', () => {
  const wrapIn3_0 = (visualizationSettings: unknown) => ({
    manifest: { version: '3.0.0' },
    visualizationSettings
  });

  it('renames symbols.type "point" to "circle" at top level', () => {
    const data = wrapIn3_0([{ symbols: { type: 'point', size: 12 } }]);
    const result = migrateIfNeeded(data);
    const viz = (
      result.visualizationSettings as { symbols: { type: string } }[]
    )[0];
    expect(viz.symbols.type).toBe('circle');
  });

  it('preserves other symbols.type values', () => {
    const data = wrapIn3_0([{ symbols: { type: 'square', size: 12 } }]);
    const result = migrateIfNeeded(data);
    const viz = (
      result.visualizationSettings as { symbols: { type: string } }[]
    )[0];
    expect(viz.symbols.type).toBe('square');
  });

  it('does not touch objects without a symbols block', () => {
    const data = wrapIn3_0([{ style: { fillColor: '#ff0000' } }]);
    const result = migrateIfNeeded(data);
    const viz = (
      result.visualizationSettings as { style: { fillColor: string } }[]
    )[0];
    expect(viz.style.fillColor).toBe('#ff0000');
  });

  it('remaps nested symbols.type inside arrays', () => {
    const data = wrapIn3_0([[{ symbols: { type: 'point' } }]]);
    const result = migrateIfNeeded(data);
    const nested = (result.visualizationSettings as unknown[][])[0][0] as {
      symbols: { type: string };
    };
    expect(nested.symbols.type).toBe('circle');
  });

  it('is idempotent — re-running migration on already-migrated data is safe', () => {
    const data = wrapIn3_0([{ symbols: { type: 'point' } }]);
    const once = migrateIfNeeded(data);
    once.manifest = { version: '3.0.0' };
    const twice = migrateIfNeeded(once);
    const viz = (
      twice.visualizationSettings as { symbols: { type: string } }[]
    )[0];
    expect(viz.symbols.type).toBe('circle');
  });
});

// ─── serializeUploadedFile / deserializeUploadedFile ──────────────────────

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

describe('serializeUploadedFile — string content', () => {
  it('serializes string content with contentType "string"', () => {
    const file = minimalFile({ content: 'col1,col2\n1,2' });
    const s = serializeUploadedFile(file);
    expect(s.content).toBe('col1,col2\n1,2');
    expect(s.contentType).toBe('string');
  });

  it('omits content fields when content is absent', () => {
    const s = serializeUploadedFile(minimalFile());
    expect(s.content).toBeUndefined();
    expect(s.contentType).toBeUndefined();
  });
});

describe('serializeUploadedFile — ArrayBuffer content', () => {
  it('serializes ArrayBuffer as number[] by default', () => {
    const buf = new ArrayBuffer(3);
    new Uint8Array(buf).set([10, 20, 30]);
    const s = serializeUploadedFile(minimalFile({ content: buf }));
    expect(s.contentType).toBe('arraybuffer');
    expect(Array.isArray(s.content)).toBe(true);
    expect(s.content).toEqual([10, 20, 30]);
  });

  it('serializes ArrayBuffer as Uint8Array when preserveBinary is true', () => {
    const buf = new ArrayBuffer(3);
    new Uint8Array(buf).set([10, 20, 30]);
    const s = serializeUploadedFile(minimalFile({ content: buf }), {
      preserveBinary: true
    });
    expect(s.content).toBeInstanceOf(Uint8Array);
    expect(s.content).toEqual(new Uint8Array([10, 20, 30]));
  });
});

describe('serializeUploadedFile — optional fields', () => {
  it('includes columnTransformations only when non-empty', () => {
    const s1 = serializeUploadedFile(
      minimalFile({ columnTransformations: [] })
    );
    expect(s1.columnTransformations).toBeUndefined();

    const s2 = serializeUploadedFile(
      minimalFile({
        columnTransformations: [{ type: 'rename', oldName: 'a', newName: 'b' }]
      })
    );
    expect(s2.columnTransformations).toHaveLength(1);
  });

  it('includes duckdbTableName when set', () => {
    const s = serializeUploadedFile(
      minimalFile({ duckdbTableName: 'tbl_xyz' })
    );
    expect(s.duckdbTableName).toBe('tbl_xyz');
  });
});

describe('deserializeUploadedFile — string content round-trip', () => {
  it('restores string content', () => {
    const file = minimalFile({ content: 'hello,world' });
    const s = serializeUploadedFile(file);
    const restored = deserializeUploadedFile(s);
    expect(restored.content).toBe('hello,world');
  });
});

describe('deserializeUploadedFile — ArrayBuffer round-trip', () => {
  it('restores ArrayBuffer from number array serialization', () => {
    const buf = new ArrayBuffer(4);
    new Uint8Array(buf).set([1, 2, 3, 4]);
    const s = serializeUploadedFile(minimalFile({ content: buf }));
    const restored = deserializeUploadedFile(s);
    expect(restored.content).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(restored.content as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3, 4])
    );
  });

  it('restores ArrayBuffer from Uint8Array (preserveBinary path)', () => {
    const buf = new ArrayBuffer(4);
    new Uint8Array(buf).set([5, 6, 7, 8]);
    const s = serializeUploadedFile(minimalFile({ content: buf }), {
      preserveBinary: true
    });
    const restored = deserializeUploadedFile(s);
    expect(new Uint8Array(restored.content as ArrayBuffer)).toEqual(
      new Uint8Array([5, 6, 7, 8])
    );
  });
});

describe('deserializeUploadedFile — relatedFilesData round-trip', () => {
  it('restores relatedFilesData to ArrayBuffer map', () => {
    const sidecar = new ArrayBuffer(3);
    new Uint8Array(sidecar).set([7, 8, 9]);
    const file = minimalFile({ relatedFilesData: { 'data.dbf': sidecar } });
    const s = serializeUploadedFile(file);
    const restored = deserializeUploadedFile(s);
    expect(restored.relatedFilesData!['data.dbf']).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(restored.relatedFilesData!['data.dbf'])).toEqual(
      new Uint8Array([7, 8, 9])
    );
  });
});
