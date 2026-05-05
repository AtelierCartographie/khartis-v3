import { describe, expect, it } from 'vitest';
import {
  FONT_SIZE_OPTIONS,
  isAvailableFontSize,
  normalizeFontFamily,
  resolveFontFamilyStack,
  resolveFontSizeOptions
} from './fonts.constants';

describe('fonts.constants', () => {
  it('normalizes known font families from plain names and stacks', () => {
    expect(normalizeFontFamily('Inter')).toBe('Inter');
    expect(normalizeFontFamily('"Inter", sans-serif')).toBe('Inter');
    expect(normalizeFontFamily('Unknown Font')).toBeUndefined();
  });

  it('resolves a usable CSS stack for configured and custom fonts', () => {
    expect(resolveFontFamilyStack('Cabin')).toBe('"Cabin", sans-serif');
    expect(resolveFontFamilyStack('"IBM Plex Sans", sans-serif')).toBe(
      '"IBM Plex Sans", sans-serif'
    );
    expect(resolveFontFamilyStack('Custom Font')).toBe(
      '"Custom Font", sans-serif'
    );
  });

  it('exposes the canonical size options and preserves migrated in-range values', () => {
    expect(FONT_SIZE_OPTIONS).toEqual([
      '8',
      '10',
      '12',
      '14',
      '16',
      '18',
      '20',
      '24'
    ]);
    expect(resolveFontSizeOptions(16)).toEqual(FONT_SIZE_OPTIONS);
    expect(resolveFontSizeOptions(15)).toEqual([
      '8',
      '10',
      '12',
      '14',
      '15',
      '16',
      '18',
      '20',
      '24'
    ]);
  });

  it('validates allowed font sizes without casts at call sites', () => {
    expect(isAvailableFontSize(8)).toBe(true);
    expect(isAvailableFontSize(24)).toBe(true);
    expect(isAvailableFontSize(15)).toBe(false);
  });
});
