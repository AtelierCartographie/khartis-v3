import { TextLayer } from '@deck.gl/layers';
import {
  FONT_FACE_LOAD_REQUESTS,
  DEFAULT_FONT_FAMILY
} from '$lib/features/step-toolbar/fonts.constants';
import { EXPLICIT_TEXT_CHARACTER_SET } from '$lib/features/map/layers/text-character-set';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { RequiredFallbackFont } from '../utils/detect-required-fonts';

const TEXT_ATLAS_CACHE_LIMIT = 16;
const PRELOAD_TEXT_HINT = EXPLICIT_TEXT_CHARACTER_SET.join('');

const NOTO_SANS_FALLBACK_REQUESTS: Record<RequiredFallbackFont, string[]> = {
  arabic: [
    'normal 400 16px "Noto Sans Arabic"',
    'normal 700 16px "Noto Sans Arabic"'
  ],
  sc: ['normal 400 16px "Noto Sans SC"', 'normal 700 16px "Noto Sans SC"'],
  jp: ['normal 400 16px "Noto Sans JP"', 'normal 700 16px "Noto Sans JP"']
};

const FONT_LOADERS: Record<
  RequiredFallbackFont,
  Record<number, () => Promise<unknown>>
> = {
  arabic: {
    400: () => import('@fontsource/noto-sans-arabic/arabic-400.css'),
    700: () => import('@fontsource/noto-sans-arabic/arabic-700.css')
  },
  sc: {
    400: () => import('@fontsource/noto-sans-sc/chinese-simplified-400.css'),
    700: () => import('@fontsource/noto-sans-sc/chinese-simplified-700.css')
  },
  jp: {
    400: () => import('@fontsource/noto-sans-jp/japanese-400.css'),
    700: () => import('@fontsource/noto-sans-jp/japanese-700.css')
  }
};

function canUseDocumentFonts(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document;
}

function resetTextAtlasCache(): void {
  try {
    (
      TextLayer as unknown as { fontAtlasCacheLimit: number }
    ).fontAtlasCacheLimit = TEXT_ATLAS_CACHE_LIMIT;
  } catch (error) {
    logger.warn(
      'Failed to reset Deck.gl text atlas cache after font preload',
      LogCategory.UI,
      {
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

function createFontAssetsStore() {
  let ready = $state(!canUseDocumentFonts());
  let version = $state(0);
  let loadingPromise: Promise<void> | null = null;
  const loadedFallbacks = new Set<RequiredFallbackFont>();
  const loadingFallbacks = new Map<RequiredFallbackFont, Promise<void>>();

  async function ensureLoaded(): Promise<void> {
    if (ready) {
      return;
    }

    if (loadingPromise) {
      return loadingPromise;
    }

    if (!canUseDocumentFonts()) {
      ready = true;
      version += 1;
      return;
    }

    loadingPromise = (async () => {
      try {
        await Promise.all(
          FONT_FACE_LOAD_REQUESTS.map((descriptor) =>
            document.fonts.load(descriptor, PRELOAD_TEXT_HINT)
          )
        );
        await document.fonts.ready;
      } catch (error) {
        logger.warn(
          'Failed to fully preload embedded fonts; continuing with available faces',
          LogCategory.UI,
          {
            defaultFontFamily: DEFAULT_FONT_FAMILY,
            error: error instanceof Error ? error.message : String(error)
          }
        );
      } finally {
        resetTextAtlasCache();
        ready = true;
        version += 1;
        loadingPromise = null;
      }
    })();

    return loadingPromise;
  }

  async function loadFallbackFonts(
    fonts: Set<RequiredFallbackFont>
  ): Promise<void> {
    if (!canUseDocumentFonts()) {
      return;
    }

    const expanded = new Set(fonts);
    if (expanded.has('sc') || expanded.has('jp')) {
      expanded.add('sc');
      expanded.add('jp');
    }

    const toLoad = Array.from(expanded).filter(
      (f) => !loadedFallbacks.has(f) && !loadingFallbacks.has(f)
    );

    if (toLoad.length === 0) {
      return;
    }

    const promises = toLoad.map(async (font) => {
      const promise = (async () => {
        try {
          const loaders = FONT_LOADERS[font];
          if (!loaders) return;

          await Promise.all([loaders[400](), loaders[700]()]);

          const descriptors = NOTO_SANS_FALLBACK_REQUESTS[font];
          if (descriptors) {
            await Promise.all(
              descriptors.map((descriptor) =>
                document.fonts.load(descriptor, PRELOAD_TEXT_HINT)
              )
            );
            await document.fonts.ready;
          }

          loadedFallbacks.add(font);
        } catch (error) {
          logger.warn(
            `Failed to load fallback font ${font}; continuing with system fallback`,
            LogCategory.UI,
            {
              error: error instanceof Error ? error.message : String(error)
            }
          );
        } finally {
          resetTextAtlasCache();
          version += 1;
          loadingFallbacks.delete(font);
        }
      })();

      loadingFallbacks.set(font, promise);
      return promise;
    });

    await Promise.all(promises);
  }

  function getLoadedFallbacks(): ReadonlySet<RequiredFallbackFont> {
    return loadedFallbacks;
  }

  function reset(): void {
    ready = !canUseDocumentFonts();
    version = 0;
    loadingPromise = null;
    loadedFallbacks.clear();
    loadingFallbacks.clear();
  }

  return {
    get ready(): boolean {
      return ready;
    },
    get version(): number {
      return version;
    },
    ensureLoaded,
    loadFallbackFonts,
    getLoadedFallbacks,
    reset
  };
}

export const fontAssetsStore = createFontAssetsStore();
