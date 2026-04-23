import {
  FONT_FACE_LOAD_REQUESTS,
  DEFAULT_FONT_FAMILY
} from '$lib/features/step-toolbar/constants/fonts.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

function canUseDocumentFonts(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document;
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
          FONT_FACE_LOAD_REQUESTS.map((descriptor) =>
            document.fonts.load(descriptor)
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
