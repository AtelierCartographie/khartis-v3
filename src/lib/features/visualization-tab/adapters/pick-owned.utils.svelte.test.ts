import { describe, it, expect } from 'vitest';
import { pickOwnedKeys, pickRenamedKeys } from './pick-owned.utils';

describe('pickOwnedKeys', () => {
  it('returns only keys present in source', () => {
    const result = pickOwnedKeys(
      { a: 1, b: 2 } as { a?: number; b?: number; c?: number },
      ['a', 'c']
    );
    expect(result).toEqual({ a: 1 });
  });

  it('keeps undefined value when no fallbacks provided', () => {
    const result = pickOwnedKeys<{ a?: number }>({ a: undefined }, ['a']);
    expect(result).toEqual({ a: undefined });
    expect('a' in result).toBe(true);
  });

  it('uses fallback when value is undefined and fallbacks provided', () => {
    const result = pickOwnedKeys<{ a?: number }>({ a: undefined }, ['a'], {
      a: 42
    });
    expect(result).toEqual({ a: 42 });
  });

  it('does not include keys absent in source', () => {
    const result = pickOwnedKeys<{ a?: number; b?: number }>({}, ['a', 'b'], {
      a: 1,
      b: 2
    });
    expect(result).toEqual({});
  });

  it('does not pick inherited properties', () => {
    const proto = { a: 1 };
    const source = Object.create(proto);
    const result = pickOwnedKeys<{ a?: number }>(source, ['a']);
    expect(result).toEqual({});
  });
});

describe('pickRenamedKeys', () => {
  it('renames keys to target name', () => {
    const result = pickRenamedKeys<
      { foo?: number; bar?: number },
      { aaa?: number; bbb?: number }
    >({ foo: 1 }, [
      { from: 'foo', to: 'aaa' },
      { from: 'bar', to: 'bbb' }
    ]);
    expect(result).toEqual({ aaa: 1 });
  });

  it('uses fallback when value is undefined', () => {
    const result = pickRenamedKeys<{ foo?: number }, { aaa?: number }>(
      { foo: undefined },
      [{ from: 'foo', to: 'aaa' }],
      { aaa: 99 }
    );
    expect(result).toEqual({ aaa: 99 });
  });

  it('skips keys absent in source even with fallbacks', () => {
    const result = pickRenamedKeys<{ foo?: number }, { aaa?: number }>(
      {},
      [{ from: 'foo', to: 'aaa' }],
      { aaa: 99 }
    );
    expect(result).toEqual({});
  });
});
