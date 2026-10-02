import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '$lib/paraglide/runtime.js';
import { formatFileSize } from '$lib/features/commons/utils/format.utils';
import {
  hexToHsl,
  hexToRgb,
  hslToHex,
  webglToHex
} from '$lib/features/commons/utils/color-utils';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn() },
  LogCategory: { DATA: 'DATA' }
}));

async function setTestLocale(locale: 'fr' | 'en'): Promise<void> {
  await Promise.resolve(setLocale(locale, { reload: false }));
}

describe('formatFileSize', () => {
  afterEach(async () => {
    await setTestLocale('fr');
  });

  it('returns "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toMatch(/^0 (B|o)$/);
  });

  it('formats bytes using the active app locale', async () => {
    await setTestLocale('en');
    expect(formatFileSize(512)).toMatch(/^512\.00 (B|o)$/);

    await setTestLocale('fr');
    expect(formatFileSize(512)).toMatch(/^512,00 (B|o)$/);
  });

  it('formats kilobytes', async () => {
    await setTestLocale('en');
    expect(formatFileSize(1024)).toMatch(/^1\.00 (KB|Ko)$/);
  });

  it('formats megabytes', async () => {
    await setTestLocale('en');
    expect(formatFileSize(1024 * 1024)).toMatch(/^1\.00 (MB|Mo)$/);
  });

  it('formats gigabytes', async () => {
    await setTestLocale('en');
    expect(formatFileSize(1024 ** 3)).toMatch(/^1\.00 (GB|Go)$/);
  });
});

describe('color-utils — pure math', () => {
  describe('hslToHex / hexToHsl round-trip', () => {
    it('converts red hsl(0, 100%, 50%) to #ff0000', () => {
      expect(hslToHex(0, 100, 50).toLowerCase()).toBe('#ff0000');
    });

    it('converts green hsl(120, 100%, 50%) to #00ff00', () => {
      expect(hslToHex(120, 100, 50).toLowerCase()).toBe('#00ff00');
    });

    it('hexToHsl round-trips through hslToHex', () => {
      const hex = '#3399cc';
      const hsl = hexToHsl(hex);
      const back = hslToHex(hsl.hue, hsl.saturation, hsl.lightness);
      expect(back.toLowerCase()).toBe(hex.toLowerCase());
    });
  });

  describe('hexToRgb', () => {
    it('parses #ffffff as [255, 255, 255]', () => {
      expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    });

    it('parses #000000 as [0, 0, 0]', () => {
      expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    });
  });

  describe('webglToHex', () => {
    it('converts [128, 128, 128, 255] to #808080', () => {
      expect(webglToHex([128, 128, 128, 255])).toBe('#808080');
    });

    it('converts [0, 0, 0, 255] to #000000', () => {
      expect(webglToHex([0, 0, 0, 255])).toBe('#000000');
    });

    it('converts [255, 255, 255, 255] to #ffffff', () => {
      expect(webglToHex([255, 255, 255, 255])).toBe('#ffffff');
    });
  });
});
