import { describe, expect, it } from 'vitest';
import { detectRequiredFonts } from './detect-required-fonts';

describe('detectRequiredFonts', () => {
  it('detects Arabic characters', () => {
    const result = detectRequiredFonts('Hello مرحبا world');
    expect(result.has('arabic')).toBe(true);
    expect(result.has('sc')).toBe(false);
    expect(result.has('jp')).toBe(false);
  });

  it('detects simplified Chinese characters', () => {
    const result = detectRequiredFonts('Beijing 北京');
    expect(result.has('arabic')).toBe(false);
    expect(result.has('sc')).toBe(true);
    expect(result.has('jp')).toBe(false);
  });

  it('detects Japanese hiragana/katakana', () => {
    const result = detectRequiredFonts('Tokyo とうきょう');
    expect(result.has('arabic')).toBe(false);
    expect(result.has('sc')).toBe(false);
    expect(result.has('jp')).toBe(true);
  });

  it('detects shared CJK kanji as simplified Chinese', () => {
    const result = detectRequiredFonts('Tokyo 東京');
    expect(result.has('arabic')).toBe(false);
    expect(result.has('sc')).toBe(true);
    expect(result.has('jp')).toBe(false);
  });

  it('detects multiple scripts', () => {
    const result = detectRequiredFonts('北京 مرحبا とうきょう');
    expect(result.has('arabic')).toBe(true);
    expect(result.has('sc')).toBe(true);
    expect(result.has('jp')).toBe(true);
  });

  it('returns empty set for Latin-only text', () => {
    const result = detectRequiredFonts('Hello World!');
    expect(result.size).toBe(0);
  });
});
