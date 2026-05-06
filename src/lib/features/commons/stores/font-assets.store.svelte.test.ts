import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVAILABLE_FONTS,
  FONT_FACE_LOAD_REQUESTS
} from '$lib/features/step-toolbar/fonts.constants';

const fontAtlasCacheLimitSpy = vi.fn();

vi.mock('@deck.gl/layers', () => {
  class MockTextLayer {
    static set fontAtlasCacheLimit(limit: number) {
      fontAtlasCacheLimitSpy(limit);
    }
  }
  return {
    TextLayer: MockTextLayer
  };
});

const loggerWarnMock = vi.fn();
vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: loggerWarnMock },
  LogCategory: { UI: 'ui' }
}));

interface MutableFontFaceSet {
  load: ReturnType<typeof vi.fn>;
  ready: Promise<void>;
}

function installFontFaceSet(
  load: MutableFontFaceSet['load'],
  ready: Promise<void>
): void {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load, ready }
  });
}

describe('fontAssetsStore.ensureLoaded', () => {
  beforeEach(() => {
    fontAtlasCacheLimitSpy.mockReset();
    loggerWarnMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  it('resets the Deck.gl text atlas cache to 16 once fonts are ready', async () => {
    const load = vi.fn().mockResolvedValue([]);
    installFontFaceSet(load, Promise.resolve());

    const { fontAssetsStore } = await import('./font-assets.store.svelte');
    await fontAssetsStore.ensureLoaded();

    expect(fontAssetsStore.ready).toBe(true);
    expect(fontAtlasCacheLimitSpy).toHaveBeenCalledTimes(1);
    expect(fontAtlasCacheLimitSpy).toHaveBeenCalledWith(16);
  });

  it('preloads each FontFace request with the full text hint to fetch every unicode-range subset', async () => {
    const load = vi.fn().mockResolvedValue([]);
    installFontFaceSet(load, Promise.resolve());

    const { fontAssetsStore } = await import('./font-assets.store.svelte');
    await fontAssetsStore.ensureLoaded();

    expect(load).toHaveBeenCalled();
    for (const call of load.mock.calls) {
      expect(call.length).toBe(2);
      const [, hint] = call;
      expect(typeof hint).toBe('string');
      expect((hint as string).length).toBeGreaterThan(200);
      expect((hint as string).includes('É')).toBe(true);
      expect((hint as string).includes('Œ')).toBe(true);
    }
  });

  it('still resets the cache when document.fonts.load rejects', async () => {
    const load = vi.fn().mockRejectedValue(new Error('woff2 unreachable'));
    installFontFaceSet(load, Promise.resolve());

    const { fontAssetsStore } = await import('./font-assets.store.svelte');
    await fontAssetsStore.ensureLoaded();

    expect(fontAtlasCacheLimitSpy).toHaveBeenCalledWith(16);
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  it('does not reset twice when ensureLoaded is awaited concurrently', async () => {
    const load = vi.fn().mockResolvedValue([]);
    installFontFaceSet(load, Promise.resolve());

    const { fontAssetsStore } = await import('./font-assets.store.svelte');
    await Promise.all([
      fontAssetsStore.ensureLoaded(),
      fontAssetsStore.ensureLoaded(),
      fontAssetsStore.ensureLoaded()
    ]);

    expect(fontAtlasCacheLimitSpy).toHaveBeenCalledTimes(1);
  });
});

describe('FONT_FACE_LOAD_REQUESTS', () => {
  it('preloads each face at both the UI size (16px) and the Deck.gl atlas size (96px)', () => {
    const variants = 4;
    const sizes = 2;
    expect(FONT_FACE_LOAD_REQUESTS).toHaveLength(
      AVAILABLE_FONTS.length * variants * sizes
    );

    for (const family of AVAILABLE_FONTS) {
      const familyToken = `"${family}"`;
      const requestsForFamily = FONT_FACE_LOAD_REQUESTS.filter((descriptor) =>
        descriptor.endsWith(familyToken)
      );
      expect(requestsForFamily).toHaveLength(variants * sizes);
      expect(
        requestsForFamily.some((descriptor) => descriptor.includes(' 16px '))
      ).toBe(true);
      expect(
        requestsForFamily.some((descriptor) => descriptor.includes(' 96px '))
      ).toBe(true);
    }
  });
});
