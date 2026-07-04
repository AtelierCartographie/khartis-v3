import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import { setLocale } from '$lib/paraglide/runtime.js';
import {
  formatFileSize,
  formatValue,
  formatValueByType,
  isNumericType
} from '$lib/features/commons/utils/format.utils';
import {
  findById,
  removeById,
  replaceAtIndex,
  updateById
} from '$lib/features/commons/utils/array-helpers';
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

describe('isNumericType', () => {
  it.each(['number', 'integer', 'bigint', 'numeric'])(
    'returns true for "%s"',
    (t) => {
      expect(isNumericType(t)).toBe(true);
    }
  );

  it('returns false for non-numeric types', () => {
    expect(isNumericType('string')).toBe(false);
    expect(isNumericType('boolean')).toBe(false);
    expect(isNumericType('date')).toBe(false);
  });
});

describe('formatValue', () => {
  it('returns em-dash placeholder for null', () => {
    expect(formatValue(null)).toBe('\u2014');
  });

  it('returns em-dash placeholder for undefined', () => {
    expect(formatValue(undefined)).toBe('\u2014');
  });

  it('uses custom nullPlaceholder when provided', () => {
    expect(formatValue(null, { nullPlaceholder: 'N/A' })).toBe('N/A');
  });

  it('truncates long strings to maxStringLength', () => {
    const long = 'a'.repeat(100);
    const result = formatValue(long, { maxStringLength: 20 });
    expect(result.length).toBe(20);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns short strings unchanged', () => {
    expect(formatValue('hello')).toBe('hello');
  });

  it('converts BigInt to locale number string', () => {
    const result = formatValue(BigInt(1000));
    expect(result).toBeTruthy();
    expect(result).toContain('1');
  });
});

describe('formatValueByType', () => {
  it('returns empty string for null', () => {
    expect(formatValueByType(null, 'number')).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatValueByType(undefined, 'string')).toBe('');
  });

  it('converts to string for non-numeric type', () => {
    expect(formatValueByType('hello', 'string')).toBe('hello');
  });
});

describe('findById', () => {
  const arr = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 }
  ];

  it('finds element by id', () => {
    expect(findById(arr, 'a')).toEqual({ id: 'a', v: 1 });
  });

  it('returns undefined for missing id', () => {
    expect(findById(arr, 'z')).toBeUndefined();
  });

  it('returns undefined for undefined id', () => {
    expect(findById(arr, undefined)).toBeUndefined();
  });
});

describe('updateById', () => {
  const arr = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 }
  ];

  it('updates matching element', () => {
    const result = updateById(arr, 'a', { v: 99 });
    expect(result.find((x) => x.id === 'a')?.v).toBe(99);
  });

  it('leaves other elements unchanged', () => {
    const result = updateById(arr, 'a', { v: 99 });
    expect(result.find((x) => x.id === 'b')?.v).toBe(2);
  });

  it('returns same-length array when id not found', () => {
    const result = updateById(arr, 'z', { v: 0 });
    expect(result).toHaveLength(arr.length);
  });
});

describe('removeById', () => {
  const arr = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
    { id: 'c', v: 3 }
  ];

  it('removes the matching element', () => {
    const result = removeById(arr, 'b');
    expect(result).toHaveLength(2);
    expect(result.find((x) => x.id === 'b')).toBeUndefined();
  });

  it('returns original array length if id not found', () => {
    expect(removeById(arr, 'z')).toHaveLength(3);
  });
});

describe('replaceAtIndex', () => {
  const arr = [1, 2, 3];

  it('replaces element at index', () => {
    expect(replaceAtIndex(arr, 1, 99)).toEqual([1, 99, 3]);
  });

  it('replaces first element', () => {
    expect(replaceAtIndex(arr, 0, 0)).toEqual([0, 2, 3]);
  });

  it('throws for negative index', () => {
    expect(() => replaceAtIndex(arr, -1, 0)).toThrow(DataValidationError);
  });

  it('throws for out-of-bounds index', () => {
    expect(() => replaceAtIndex(arr, 3, 0)).toThrow(DataValidationError);
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
