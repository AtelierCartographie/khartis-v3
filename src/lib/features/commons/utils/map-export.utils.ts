import * as m from '$lib/paraglide/messages';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import {
  toCanvas as htmlToImageCanvas,
  toSvg as htmlToImageSvg
} from 'html-to-image';

interface ExportOptions {
  width: number;
  height: number;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080
};

/**
 * Shared html-to-image filter — excludes debug-only DOM nodes from exports.
 */
function exportFilter(domNode: HTMLElement): boolean {
  if (domNode.classList?.contains('page-grid')) return false;
  if (domNode.classList?.contains('view-mode-loader')) return false;
  return true;
}

/**
 * Pre-renders the WebGL canvas at the requested pixel ratio, waits for the
 * first 'render' frame, then returns a cleanup function that restores the
 * original ratio.
 *
 * Uses 'render' (not 'idle') because in interleaved Deck.gl mode 'idle' can
 * be delayed indefinitely by continuous triggerRepaint() calls.
 */
async function prerenderWebgl(pixelRatio: number): Promise<() => void> {
  const map = mapInstanceStore.map;
  if (!map) return () => {};

  const currentRatio = map.getPixelRatio();
  const scale = Math.max(pixelRatio, currentRatio);

  if (scale <= currentRatio) return () => {};

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Map render timeout during export')),
      10000
    );
    // Register BEFORE setPixelRatio — JS is single-threaded, no rAF can fire between
    map.once('render', () => {
      clearTimeout(timeout);
      resolve();
    });
    map.setPixelRatio(scale);
    map.triggerRepaint();
  });

  return () => {
    // Restore in next frame — html-to-image has already read canvas.toDataURL() synchronously
    requestAnimationFrame(() => {
      map.setPixelRatio(currentRatio);
      map.triggerRepaint();
    });
  };
}

/**
 * Temporarily mutates .page-container for export:
 *   - Hides the alignment grid
 *   - Strips the color-blindness CSS filter (CDC §2.C.2.e: not exported; the
 *     filter also refs an SVG sibling outside the container so html-to-image
 *     wouldn't resolve it anyway)
 * Returns a cleanup function that undoes both mutations.
 */
function mutateDomForExport(pageContainer: HTMLElement): () => void {
  pageContainer.classList.add('is-exporting-map');

  const pageGrids = Array.from(
    pageContainer.querySelectorAll<HTMLElement>('.page-grid')
  );
  const pageGridDisplays = pageGrids.map((grid) => grid.style.display);
  pageGrids.forEach((grid) => {
    grid.style.display = 'none';
  });

  const mapStage = pageContainer.querySelector(
    '.map-stage'
  ) as HTMLElement | null;
  const savedFilter = mapStage?.style.filter ?? '';
  if (mapStage) mapStage.style.filter = 'none';

  return () => {
    pageContainer.classList.remove('is-exporting-map');
    pageGrids.forEach((grid, index) => {
      grid.style.display = pageGridDisplays[index] ?? '';
    });
    if (mapStage) mapStage.style.filter = savedFilter;
  };
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

/**
 * Converts a data URL to a Blob without going through fetch().
 * Handles both base64-encoded and URL-encoded data URLs.
 * Avoids unnecessary network-stack overhead and CSP connect-src constraints.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, commaIdx);
  const data = dataUrl.slice(commaIdx + 1);
  const mimeType = meta.split(':')[1].split(';')[0];

  if (meta.includes(';base64')) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  // URL-encoded (html-to-image SVG output format)
  return new Blob([decodeURIComponent(data)], { type: mimeType });
}

export async function exportMapToSvg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };

  const pageContainer = document.querySelector(
    '.page-container'
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  const pixelRatio = Math.min(
    opts.width / pageContainer.offsetWidth,
    opts.height / pageContainer.offsetHeight
  );

  const restoreRatio = await prerenderWebgl(pixelRatio);
  const restoreDom = mutateDomForExport(pageContainer);
  await waitForNextFrame();

  try {
    const svgDataUrl = await htmlToImageSvg(pageContainer, {
      pixelRatio,
      style: { boxShadow: 'none' },
      filter: exportFilter,
      skipFonts: true // avoid CORS issues fetching CDN fonts into SVG
    });

    return dataUrlToBlob(svgDataUrl);
  } finally {
    restoreDom();
    restoreRatio();
  }
}

export async function exportMapToJpg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };

  const pageContainer = document.querySelector(
    '.page-container'
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  // Scale the page to fit within the target dimensions (letterbox if aspect ratios differ).
  // Math.min ensures both dimensions stay within target; for identical aspect ratios (e.g.
  // 16:9 page + 16:9 QHD target) both values are equal and the output is pixel-perfect.
  const pagePixelRatio = Math.min(
    opts.width / pageContainer.offsetWidth,
    opts.height / pageContainer.offsetHeight
  );

  const restoreRatio = await prerenderWebgl(pagePixelRatio);
  const restoreDom = mutateDomForExport(pageContainer);
  await waitForNextFrame();

  const pageCanvas = await (async (): Promise<HTMLCanvasElement | null> => {
    try {
      // Step 1 — capture as canvas. toCanvas skips the PNG Blob encode/decode
      // round-trip that toBlob + createImageBitmap would incur.
      return await htmlToImageCanvas(pageContainer, {
        pixelRatio: pagePixelRatio,
        style: { boxShadow: 'none' },
        filter: exportFilter
      });
    } finally {
      restoreDom();
      restoreRatio();
    }
  })();

  if (!pageCanvas) {
    return Promise.reject(new Error('Failed to capture page'));
  }

  // Step 2 — composite into an exact opts.width × opts.height canvas.
  // If page aspect ratio === target (e.g. 16:9 page + QHD), pageCanvas fills exactly.
  // Otherwise white letterbox bands appear on the shorter axis.
  const offscreen = new OffscreenCanvas(opts.width, opts.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    return Promise.reject(
      new Error('Failed to get 2D context for export canvas')
    );
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, opts.width, opts.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    pageCanvas,
    Math.round((opts.width - pageCanvas.width) / 2),
    Math.round((opts.height - pageCanvas.height) / 2)
  );

  return offscreen.convertToBlob({ type: 'image/jpeg', quality: 1.0 });
}
