import type { RequiredFallbackFont } from '../utils/detect-required-fonts';
import { TextLayer } from '@deck.gl/layers';
import '@fontsource/noto-sans-arabic/arabic-400.css';
import '@fontsource/noto-sans-arabic/arabic-700.css';
import '@fontsource/noto-sans-sc/chinese-simplified-400.css';
import '@fontsource/noto-sans-sc/chinese-simplified-700.css';
import '@fontsource/noto-sans-jp/japanese-400.css';
import '@fontsource/noto-sans-jp/japanese-700.css';
import {
  FONT_FACE_LOAD_REQUESTS,
  PRELOADED_FONTS,
  getFontFaceLoadRequests,
  normalizeFontFamily,
  type AvailableFont
} from '$lib/features/step-toolbar/fonts.constants';
import { EXPLICIT_TEXT_CHARACTER_SET } from '$lib/features/map/layers/text-character-set';
import { LogCategory, logger } from '../utils/logger';

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

function canUseDocumentFonts(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document;
}

function resetTextAtlasCache(): void {
  try {
    (
      TextLayer as unknown as { fontAtlasCacheLimit: number }
    ).fontAtlasCacheLimit = TEXT_ATLAS_CACHE_LIMIT;
  } catch (error) {
    logger.error(
      'Failed to reset Deck text atlas cache',
      LogCategory.MAP,
      error
    );
  }
}

function createFontAssetsStore() {
  let ready = $state(!canUseDocumentFonts());
  let version = $state(0);
  let loadingPromise: Promise<void> | null = null;
  const loadedFallbacks = new Set<RequiredFallbackFont>();
  const loadingFallbacks = new Map<RequiredFallbackFont, Promise<void>>();
  const loadedFonts = new Set<AvailableFont>(PRELOADED_FONTS);
  const loadingFonts = new Map<AvailableFont, Promise<void>>();

  function loadFont(font: AvailableFont): Promise<void> {
    const pending = loadingFonts.get(font);
    if (pending) return pending;

    const promise = (async () => {
      try {
        await Promise.all(
          getFontFaceLoadRequests(font).map((descriptor) =>
            document.fonts.load(descriptor, PRELOAD_TEXT_HINT)
          )
        );
      } catch (error) {
        logger.error('Failed to load font assets', LogCategory.MAP, error);
      } finally {
        loadedFonts.add(font);
        loadingFonts.delete(font);
        resetTextAtlasCache();
        version += 1;
      }
    })();
    loadingFonts.set(font, promise);
    return promise;
  }

  /**
   * Whether a label layer can draw with this font now. A font that is not
   * loaded yet starts loading and bumps `version` once it is ready: drawing
   * before that would bake the fallback glyphs into Deck's font atlas.
   */
  function isFontReady(fontFamily?: string | null): boolean {
    if (!ready) return false;
    const font = normalizeFontFamily(fontFamily);
    if (!font || loadedFonts.has(font)) return true;
    if (canUseDocumentFonts()) void loadFont(font);
    return false;
  }

  /** Resolves once every font a label layer has asked for is loaded. */
  async function whenFontsSettled(): Promise<void> {
    await Promise.all(loadingFonts.values());
  }

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
        logger.error('Failed to load base font assets', LogCategory.MAP, error);
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
          logger.error(
            'Failed to load fallback font assets',
            LogCategory.MAP,
            error
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
    loadedFonts.clear();
    PRELOADED_FONTS.forEach((font) => loadedFonts.add(font));
    loadingFonts.clear();
  }

  return {
    get ready(): boolean {
      return ready;
    },
    get version(): number {
      return version;
    },
    ensureLoaded,
    isFontReady,
    whenFontsSettled,
    loadFallbackFonts,
    getLoadedFallbacks,
    reset
  };
}

export const fontAssetsStore = createFontAssetsStore();
