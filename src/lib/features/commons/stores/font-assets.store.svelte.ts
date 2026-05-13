import { TextLayer } from '@deck.gl/layers';
import {
  FONT_FACE_LOAD_REQUESTS,
  DEFAULT_FONT_FAMILY
} from '$lib/features/step-toolbar/fonts.constants';
import { EXPLICIT_TEXT_CHARACTER_SET } from '$lib/features/map/layers/text-character-set';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const TEXT_ATLAS_CACHE_LIMIT = 16;
const PRELOAD_TEXT_HINT = EXPLICIT_TEXT_CHARACTER_SET.join('');

const NOTO_SANS_FALLBACK_REQUESTS = [
  'normal 400 16px "Noto Sans Arabic"',
  'normal 700 16px "Noto Sans Arabic"',
  'normal 400 16px "Noto Sans SC"',
  'normal 700 16px "Noto Sans SC"',
  'normal 400 16px "Noto Sans JP"',
  'normal 700 16px "Noto Sans JP"'
];

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
          [...FONT_FACE_LOAD_REQUESTS, ...NOTO_SANS_FALLBACK_REQUESTS].map(
            (descriptor) => document.fonts.load(descriptor, PRELOAD_TEXT_HINT)
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

  function reset(): void {
    ready = !canUseDocumentFonts();
    version = 0;
    loadingPromise = null;
  }

  return {
    get ready(): boolean {
      return ready;
    },
    get version(): number {
      return version;
    },
    ensureLoaded,
    reset
  };
}

export const fontAssetsStore = createFontAssetsStore();
