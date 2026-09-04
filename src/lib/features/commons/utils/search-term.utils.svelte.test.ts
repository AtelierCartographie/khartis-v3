import { describe, expect, it } from 'vitest';
import { toCanonicalNumericTerm } from './search-term.utils';

describe('toCanonicalNumericTerm', () => {
  it('reads a lone comma as the decimal separator', () => {
    expect(toCanonicalNumericTerm('0,1')).toBe('0.1');
    expect(toCanonicalNumericTerm('89,358')).toBe('89.358');
    expect(toCanonicalNumericTerm('-12,5')).toBe('-12.5');
  });

  it('drops grouping separators, whatever the locale convention', () => {
    expect(toCanonicalNumericTerm('1 234,56')).toBe('1234.56');
    expect(toCanonicalNumericTerm('1\u00a0234,56')).toBe('1234.56');
    expect(toCanonicalNumericTerm('1\u202f234,56')).toBe('1234.56');
    expect(toCanonicalNumericTerm('1,234.56')).toBe('1234.56');
    expect(toCanonicalNumericTerm('1,234,567')).toBe('1234567');
    expect(toCanonicalNumericTerm("1'234")).toBe('1234');
  });

  it('leaves an already canonical number untouched', () => {
    expect(toCanonicalNumericTerm('69.157')).toBe('69.157');
    expect(toCanonicalNumericTerm('2020')).toBe('2020');
  });

  it('rejects terms that are not numeric', () => {
    expect(toCanonicalNumericTerm('Madagascar')).toBeNull();
    expect(toCanonicalNumericTerm('MDG-12')).toBeNull();
    expect(toCanonicalNumericTerm('')).toBeNull();
    expect(toCanonicalNumericTerm(',')).toBeNull();
  });
});
