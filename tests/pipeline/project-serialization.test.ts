import { describe, expect, it, vi } from 'vitest';
import { PROJECT_CONST } from '$lib/features/project-management/constants';
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
  it('is a no-op when manifest version is already current', () => {
    const data = {
      manifest: { version: PROJECT_CONST.APP_VERSION },
      settings: { value: 42 }
    };
    const result = migrateIfNeeded(data);
    expect(result.settings).toEqual({ value: 42 });
    expect((result.manifest as { version: string }).version).toBe(
      PROJECT_CONST.APP_VERSION
    );
  });

  it('stamps APP_VERSION when no migration runs (no-op path)', () => {
    const data = {
      manifest: { version: PROJECT_CONST.APP_VERSION, extra: 'preserved' }
    };
    const result = migrateIfNeeded(data);
    expect((result.manifest as Record<string, unknown>).extra).toBe(
      'preserved'
    );
    expect((result.manifest as { version: string }).version).toBe(
      PROJECT_CONST.APP_VERSION
    );
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

// ─── Roundtrip: serialize → migrate → parse ───────────────────────────────
//
// Guards against regressions on the .kh persistence pipeline: a legacy project
// saved in 3.0.0 must round-trip through JSON and come out with the current
// schema version plus migrated payload.

describe('migrateIfNeeded — .kh roundtrip', () => {
  it('preserves migrated payload across JSON stringify/parse for a 3.0.0 project', () => {
    const legacyProject = {
      manifest: { version: '3.0.0', name: 'Legacy', extra: 'keep-me' },
      visualizationSettings: [
        { symbols: { type: 'point', size: 12 } },
        { symbols: { type: 'square', size: 10 } }
      ],
      layoutSettings: { pageFormat: 'a4' },
      uiSettings: { zoomMode: 'map' }
    };

    const json = JSON.stringify(legacyProject);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const migrated = migrateIfNeeded(parsed);

    const rehydrated = JSON.parse(JSON.stringify(migrated)) as {
      manifest: { version: string; extra: string; name: string };
      visualizationSettings: { symbols: { type: string; size: number } }[];
      layoutSettings: { pageFormat: string };
      uiSettings: { zoomMode: string };
    };

    expect(rehydrated.manifest.version).not.toBe('3.0.0');
    expect(rehydrated.manifest.extra).toBe('keep-me');
    expect(rehydrated.manifest.name).toBe('Legacy');
    expect(rehydrated.visualizationSettings[0].symbols.type).toBe('circle');
    expect(rehydrated.visualizationSettings[1].symbols.type).toBe('square');
    expect(rehydrated.layoutSettings.pageFormat).toBe('a4');
    expect(rehydrated.uiSettings.zoomMode).toBe('map');
  });

  it('accepts a current-version project without mutation on roundtrip', () => {
    const currentProject = {
      manifest: { version: PROJECT_CONST.APP_VERSION, name: 'Current' },
      visualizationSettings: [{ symbols: { type: 'circle', size: 14 } }]
    };

    const json = JSON.stringify(currentProject);
    const migrated = migrateIfNeeded(
      JSON.parse(json) as Record<string, unknown>
    );

    const rehydrated = JSON.parse(JSON.stringify(migrated)) as {
      manifest: { version: string; name: string };
      visualizationSettings: { symbols: { type: string; size: number } }[];
    };

    expect(rehydrated.manifest.name).toBe('Current');
    expect(rehydrated.visualizationSettings[0].symbols.type).toBe('circle');
    expect(rehydrated.visualizationSettings[0].symbols.size).toBe(14);
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
    const s = serializeUploadedFile(file);
    expect(s.assetRef?.assetId).toBe('asset-1');
    expect((s as unknown as Record<string, unknown>).content).toBeUndefined();
  });

  it('persists companion asset refs for multi-file sources', () => {
    const s = serializeUploadedFile(
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
    expect(s.companionAssetRefs).toHaveLength(1);
    expect(s.companionAssetRefs?.[0]?.originalName).toBe('data.dbf');
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

describe('deserializeUploadedFile — asset ref round-trip', () => {
  it('restores persisted asset references', () => {
    const s = serializeUploadedFile(
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
    const restored = deserializeUploadedFile(s);
    expect(restored.assetRef?.assetId).toBe('asset-1');
    expect(restored.companionAssetRefs?.[0]?.assetId).toBe('asset-2');
    expect(restored.content).toBeUndefined();
  });
});
