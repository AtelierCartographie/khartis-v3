import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDescribe,
  getRowCountFromCache,
  getTableMetadata,
  invalidateTableCache,
  markTableMutated,
  registerTableMutationCallback,
  setDescribe,
  setRowCountCache
} from '$lib/features/duckdb/cache/cache-manager';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function makeCtx(): DuckDBContext {
  return {
    describeCache: new Map(),
    rowCountCache: new Map(),
    table_metadata: new Map()
  } as unknown as DuckDBContext;
}

describe('getTableMetadata', () => {
  it('creates and returns a default metadata record for a new table', () => {
    const ctx = makeCtx();
    const meta = getTableMetadata(ctx, 'tbl');
    expect(meta).toEqual({
      analysis: null,
      join: null,
      filters: expect.any(Map)
    });
  });

  it('returns the same object on repeated calls (referential stability)', () => {
    const ctx = makeCtx();
    expect(getTableMetadata(ctx, 'tbl')).toBe(getTableMetadata(ctx, 'tbl'));
  });
});

describe('describeCache', () => {
  it('returns undefined when not yet set', () => {
    expect(getDescribe(makeCtx(), 'tbl')).toBeUndefined();
  });

  it('returns the stored describe result after setDescribe', () => {
    const ctx = makeCtx();
    const desc = { name: ['id'], type: ['INTEGER'] };
    setDescribe(ctx, 'tbl', desc);
    expect(getDescribe(ctx, 'tbl')).toBe(desc);
  });
});

describe('rowCountCache', () => {
  it('returns undefined when not yet set', () => {
    expect(getRowCountFromCache(makeCtx(), 'tbl')).toBeUndefined();
  });

  it('returns the stored count after setRowCountCache', () => {
    const ctx = makeCtx();
    setRowCountCache(ctx, 'tbl', 42);
    expect(getRowCountFromCache(ctx, 'tbl')).toBe(42);
  });
});

describe('invalidateTableCache', () => {
  it('clears describe and rowCount caches for the specified table', () => {
    const ctx = makeCtx();
    setDescribe(ctx, 'tbl', { name: ['id'], type: ['INTEGER'] });
    setRowCountCache(ctx, 'tbl', 10);
    invalidateTableCache(ctx, 'tbl');
    expect(getDescribe(ctx, 'tbl')).toBeUndefined();
    expect(getRowCountFromCache(ctx, 'tbl')).toBeUndefined();
  });

  it('does not affect other tables', () => {
    const ctx = makeCtx();
    setRowCountCache(ctx, 'other', 5);
    invalidateTableCache(ctx, 'tbl');
    expect(getRowCountFromCache(ctx, 'other')).toBe(5);
  });
});

describe('markTableMutated + registerTableMutationCallback', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('notifies registered listener when a table is mutated', () => {
    const ctx = makeCtx();
    const received: string[] = [];
    cleanup = registerTableMutationCallback((t) => received.push(t));
    markTableMutated(ctx, 'tbl');
    expect(received).toContain('tbl');
  });

  it('unregister callback stops receiving notifications', () => {
    const ctx = makeCtx();
    const received: string[] = [];
    const unregister = registerTableMutationCallback((t) => received.push(t));
    unregister();
    markTableMutated(ctx, 'tbl');
    expect(received).toHaveLength(0);
  });

  it('also invalidates cache on mutation', () => {
    const ctx = makeCtx();
    setRowCountCache(ctx, 'tbl', 99);
    markTableMutated(ctx, 'tbl');
    expect(getRowCountFromCache(ctx, 'tbl')).toBeUndefined();
  });
});
