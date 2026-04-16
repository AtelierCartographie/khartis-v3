import { describe, expect, it } from 'vitest';
import {
  bigIntReplacer,
  deepClone,
  safeJsonParse,
  safeJsonStringify
} from '$lib/features/commons/utils/clone.utils';
import { deepCloneForStorage } from '$lib/features/commons/utils/clone-for-storage.utils';
import { estimateProjectStorageSize } from '$lib/features/commons/utils/size-estimation.utils';

describe('bigIntReplacer', () => {
  it('converts BigInt to Number', () => {
    expect(bigIntReplacer('', BigInt(42))).toBe(42);
  });

  it('passes through non-BigInt values unchanged', () => {
    expect(bigIntReplacer('', 'hello')).toBe('hello');
    expect(bigIntReplacer('', 42)).toBe(42);
    expect(bigIntReplacer('', null)).toBeNull();
  });
});

describe('deepClone', () => {
  it('returns null/undefined as-is', () => {
    expect(deepClone(null)).toBeNull();
    expect(deepClone(undefined)).toBeUndefined();
  });

  it('deep clones a plain object', () => {
    const obj = { a: 1, b: { c: 2 } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.b).not.toBe(obj.b);
  });

  it('serializes BigInt when replacer is provided', () => {
    const obj = { value: BigInt(999) };
    const clone = deepClone(obj, bigIntReplacer);
    expect(clone.value).toBe(999);
  });
});

describe('safeJsonStringify / safeJsonParse', () => {
  it('round-trips a plain object', () => {
    const obj = { x: 1, y: 'hello' };
    expect(safeJsonParse(safeJsonStringify(obj))).toEqual(obj);
  });

  it('serializes BigInt values as numbers', () => {
    const result = safeJsonStringify({ n: BigInt(7) });
    expect(result).toContain('"n":7');
  });
});

describe('deepCloneForStorage — primitives and null', () => {
  it('returns null unchanged', () => {
    expect(deepCloneForStorage(null)).toBeNull();
  });

  it('returns undefined unchanged', () => {
    expect(deepCloneForStorage(undefined)).toBeUndefined();
  });

  it('converts BigInt to Number', () => {
    expect(deepCloneForStorage(BigInt(42))).toBe(42);
  });

  it('passes string, number, boolean through unchanged', () => {
    expect(deepCloneForStorage('hello')).toBe('hello');
    expect(deepCloneForStorage(42)).toBe(42);
    expect(deepCloneForStorage(true)).toBe(true);
  });
});

describe('deepCloneForStorage — Date', () => {
  it('clones a Date with same timestamp', () => {
    const d = new Date(2024, 5, 15);
    const clone = deepCloneForStorage(d) as Date;
    expect(clone).not.toBe(d);
    expect(clone.getTime()).toBe(d.getTime());
  });
});

describe('deepCloneForStorage — ArrayBuffer', () => {
  it('returns a new ArrayBuffer with same content', () => {
    const buf = new ArrayBuffer(4);
    new Uint8Array(buf).set([1, 2, 3, 4]);
    const clone = deepCloneForStorage(buf) as ArrayBuffer;
    expect(clone).not.toBe(buf);
    expect(new Uint8Array(clone)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});

describe('deepCloneForStorage — Uint8Array byteOffset', () => {
  it('copies only the subview bytes (byteOffset edge case)', () => {
    const buf = new ArrayBuffer(8);
    const full = new Uint8Array(buf);
    full.set([0, 0, 10, 20, 30, 40, 0, 0]);

    const view = new Uint8Array(buf, 2, 4);
    const clone = deepCloneForStorage(view) as Uint8Array;

    expect(clone).toHaveLength(4);
    expect(Array.from(clone)).toEqual([10, 20, 30, 40]);
    expect(clone.buffer.byteLength).toBe(4);
  });
});

describe('deepCloneForStorage — Map and Set', () => {
  it('converts Map to plain object', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2]
    ]);
    const result = deepCloneForStorage(map) as Record<string, number>;
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('converts Set to array', () => {
    const set = new Set([1, 2, 3]);
    expect(deepCloneForStorage(set)).toEqual([1, 2, 3]);
  });
});

describe('deepCloneForStorage — nested objects and arrays', () => {
  it('deep clones nested objects', () => {
    const obj = { a: { b: { c: 42 } } };
    const clone = deepCloneForStorage(obj) as typeof obj;
    expect(clone).toEqual(obj);
    expect(clone.a).not.toBe(obj.a);
    expect(clone.a.b).not.toBe(obj.a.b);
  });

  it('deep clones arrays with mixed types', () => {
    const arr = [1, 'two', { three: 3 }];
    const clone = deepCloneForStorage(arr) as typeof arr;
    expect(clone).toEqual(arr);
    expect(clone[2]).not.toBe(arr[2]);
  });
});

describe('estimateProjectStorageSize', () => {
  it('returns a positive number for a minimal project', () => {
    const project = { name: 'test', version: 1 };
    expect(estimateProjectStorageSize(project)).toBeGreaterThan(0);
  });

  it('includes ArrayBuffer byte lengths', () => {
    const buf = new ArrayBuffer(1000);
    const project = {
      data: {
        sourceFiles: [{ content: buf }]
      }
    };
    const size = estimateProjectStorageSize(project);
    expect(size).toBeGreaterThan(1000);
  });

  it('counts string content at 2 bytes per char', () => {
    const str = 'x'.repeat(100);
    const withString = estimateProjectStorageSize({
      data: { sourceFiles: [{ content: str }] }
    });
    const withoutString = estimateProjectStorageSize({
      data: { sourceFiles: [{}] }
    });
    expect(withString - withoutString).toBeGreaterThanOrEqual(200);
  });

  it('strips binary fields before computing metadata JSON size', () => {
    const buf = new ArrayBuffer(10000);
    const project = {
      data: { sourceFiles: [{ content: buf, name: 'file.csv' }] }
    };
    const size = estimateProjectStorageSize(project);
    const metadataOnly = estimateProjectStorageSize({
      data: { sourceFiles: [{ name: 'file.csv' }] }
    });
    expect(size - metadataOnly).toBeCloseTo(10000, -2);
  });
});
