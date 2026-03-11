import { describe, expect, it, vi } from 'vitest';
import {
  invalidateTableCache,
  markTableMutated,
  registerTableMutationCallback,
  getTableMetadata,
  getDescribe,
  setDescribe,
  getRowCountFromCache,
  setRowCountCache
} from '$lib/features/duckdb/cache/cache-manager';
import type {
  DuckDBContext,
  CacheState,
  DescribeResult
} from '$lib/features/duckdb/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<DuckDBContext> = {}): DuckDBContext {
  return {
    db: null as never,
    connection: null as never,
    loaded_files: new Map(),
    registered_files: new Set(),
    table_metadata: new Map(),
    table_geoparquet_cache: new Map(),
    describeCache: new Map(),
    rowCountCache: new Map(),
    cacheState: { size: 0, accessOrder: [] } satisfies CacheState,
    extensionsLoaded: { spatial: false, httpfs: false },
    extensionLoadPromises: { spatial: null, httpfs: null },
    localExtensionRepositoryConfigured: false,
    threadsSupported: false,
    bundleVariant: 'mvp',
    ...overrides
  };
}

// ── invalidateTableCache ──────────────────────────────────────────────────────

describe('invalidateTableCache', () => {
  it("supprime l'entrée du describeCache pour la table donnée", () => {
    const ctx = makeCtx();
    const describeData: DescribeResult = { name: ['col1'], type: ['VARCHAR'] };
    ctx.describeCache.set('my_table', describeData);

    invalidateTableCache(ctx, 'my_table');

    expect(ctx.describeCache.has('my_table')).toBe(false);
  });

  it("supprime l'entrée du rowCountCache pour la table donnée", () => {
    const ctx = makeCtx();
    ctx.rowCountCache.set('my_table', 42);

    invalidateTableCache(ctx, 'my_table');

    expect(ctx.rowCountCache.has('my_table')).toBe(false);
  });

  it("ne supprime pas les entrées d'autres tables", () => {
    const ctx = makeCtx();
    ctx.describeCache.set('table_a', { name: [], type: [] });
    ctx.describeCache.set('table_b', { name: [], type: [] });

    invalidateTableCache(ctx, 'table_a');

    expect(ctx.describeCache.has('table_b')).toBe(true);
  });

  it("ne lance pas d'erreur pour une table absente des caches", () => {
    const ctx = makeCtx();
    expect(() => invalidateTableCache(ctx, 'nonexistent')).not.toThrow();
  });
});

// ── markTableMutated ──────────────────────────────────────────────────────────

describe('markTableMutated', () => {
  it('invalide les caches de la table', () => {
    const ctx = makeCtx();
    ctx.describeCache.set('tbl', { name: [], type: [] });
    ctx.rowCountCache.set('tbl', 10);

    markTableMutated(ctx, 'tbl');

    expect(ctx.describeCache.has('tbl')).toBe(false);
    expect(ctx.rowCountCache.has('tbl')).toBe(false);
  });

  it("évince l'entrée geoparquet et met à jour cacheState.size", () => {
    const buffer = new Uint8Array(100);
    const ctx = makeCtx();
    ctx.table_geoparquet_cache.set('tbl', buffer);
    ctx.cacheState.size = 100;
    ctx.cacheState.accessOrder = ['tbl'];

    markTableMutated(ctx, 'tbl');

    expect(ctx.table_geoparquet_cache.has('tbl')).toBe(false);
    expect(ctx.cacheState.size).toBe(0);
    expect(ctx.cacheState.accessOrder).not.toContain('tbl');
  });

  it('retire la table de accessOrder même si elle est au milieu de la liste', () => {
    const buffer = new Uint8Array(50);
    const ctx = makeCtx();
    ctx.table_geoparquet_cache.set('middle', buffer);
    ctx.cacheState.size = 50;
    ctx.cacheState.accessOrder = ['first', 'middle', 'last'];

    markTableMutated(ctx, 'middle');

    expect(ctx.cacheState.accessOrder).toEqual(['first', 'last']);
  });

  it('appelle le callback enregistré avec le nom de la table', () => {
    const callback = vi.fn();
    registerTableMutationCallback(callback);

    const ctx = makeCtx();
    markTableMutated(ctx, 'watched_table');

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('watched_table');

    // cleanup
    registerTableMutationCallback(null as never);
  });

  it("ne lance pas d'erreur quand aucun callback n'est enregistré", () => {
    registerTableMutationCallback(null as never);
    const ctx = makeCtx();
    expect(() => markTableMutated(ctx, 'tbl')).not.toThrow();
  });

  it("ne modifie pas cacheState.size quand la table n'est pas dans geoparquet_cache", () => {
    const ctx = makeCtx();
    ctx.cacheState.size = 200;

    markTableMutated(ctx, 'absent_table');

    expect(ctx.cacheState.size).toBe(200);
  });
});

// ── getTableMetadata ──────────────────────────────────────────────────────────

describe('getTableMetadata', () => {
  it('crée une entrée de métadonnées par défaut si absente', () => {
    const ctx = makeCtx();
    const meta = getTableMetadata(ctx, 'new_table');

    expect(meta).toEqual({
      analysis: null,
      join: null,
      filters: expect.any(Map)
    });
  });

  it("retourne la même référence lors d'appels successifs", () => {
    const ctx = makeCtx();
    const meta1 = getTableMetadata(ctx, 'tbl');
    const meta2 = getTableMetadata(ctx, 'tbl');

    expect(meta1).toBe(meta2);
  });

  it('stocke les métadonnées dans ctx.table_metadata', () => {
    const ctx = makeCtx();
    getTableMetadata(ctx, 'stored_tbl');

    expect(ctx.table_metadata.has('stored_tbl')).toBe(true);
  });

  it('initialise filters comme une Map vide', () => {
    const ctx = makeCtx();
    const meta = getTableMetadata(ctx, 'tbl');

    expect(meta.filters).toBeInstanceOf(Map);
    expect(meta.filters.size).toBe(0);
  });
});

// ── getDescribe / setDescribe ─────────────────────────────────────────────────

describe('getDescribe / setDescribe', () => {
  it('retourne undefined pour une table absente du cache', () => {
    const ctx = makeCtx();
    expect(getDescribe(ctx, 'missing')).toBeUndefined();
  });

  it('setDescribe puis getDescribe retourne les données stockées', () => {
    const ctx = makeCtx();
    const data: DescribeResult = {
      name: ['id', 'name'],
      type: ['INTEGER', 'VARCHAR']
    };

    setDescribe(ctx, 'tbl', data);

    expect(getDescribe(ctx, 'tbl')).toEqual(data);
  });

  it("écrase les données existantes lors d'un second setDescribe", () => {
    const ctx = makeCtx();
    setDescribe(ctx, 'tbl', { name: ['old'], type: ['INTEGER'] });
    setDescribe(ctx, 'tbl', { name: ['new'], type: ['VARCHAR'] });

    expect(getDescribe(ctx, 'tbl')).toEqual({
      name: ['new'],
      type: ['VARCHAR']
    });
  });
});

// ── getRowCountFromCache / setRowCountCache ────────────────────────────────────

describe('getRowCountFromCache / setRowCountCache', () => {
  it('retourne undefined pour une table absente du cache', () => {
    const ctx = makeCtx();
    expect(getRowCountFromCache(ctx, 'missing')).toBeUndefined();
  });

  it('setRowCountCache puis getRowCountFromCache retourne le compte stocké', () => {
    const ctx = makeCtx();
    setRowCountCache(ctx, 'tbl', 1234);

    expect(getRowCountFromCache(ctx, 'tbl')).toBe(1234);
  });

  it('stocke 0 comme valeur valide', () => {
    const ctx = makeCtx();
    setRowCountCache(ctx, 'empty_tbl', 0);

    expect(getRowCountFromCache(ctx, 'empty_tbl')).toBe(0);
  });

  it('écrase la valeur existante', () => {
    const ctx = makeCtx();
    setRowCountCache(ctx, 'tbl', 100);
    setRowCountCache(ctx, 'tbl', 999);

    expect(getRowCountFromCache(ctx, 'tbl')).toBe(999);
  });
});
