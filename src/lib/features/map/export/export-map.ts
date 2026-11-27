import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import * as m from '$lib/paraglide/messages';
import { toCanvas as htmlToImageCanvas } from 'html-to-image';
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_BACKGROUND_COLOR,
  EXPORT_PAGE_SELECTOR,
  JPEG_EXPORT_QUALITY
} from './constants';
import { captureMapLibreBackgroundForSvg } from './deck-layer';
import {
  buildGeoreferenceFrameLayer,
  buildStructuredSvgMarkup,
  resolveMapPlacement,
  withPreparedMapExport
} from './page-assembly';
import { resolvePageExportGeometry } from './svg-values';
import type { MapExportPlacement, MapExportRequest } from './types';
import {
  exportFilter,
  getExportPixelRatio,
  getExportPixelRatioForSize
} from './webgl-prerender';

export async function exportMapToSvg(
  options: MapExportRequest = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  await fontAssetsStore.ensureLoaded();
  await fontAssetsStore.whenFontsSettled();

  const pageContainer = document.querySelector(
    EXPORT_PAGE_SELECTOR
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  return withPreparedMapExport(pageContainer, async ({ prerenderWebgl }) => {
    const pageGeometry = resolvePageExportGeometry(pageContainer);
    const pixelRatio = getExportPixelRatioForSize(
      pageGeometry.width,
      pageGeometry.height,
      opts
    );

    await prerenderWebgl(pixelRatio);

    const mapLibreBackgroundDataUrl =
      await captureMapLibreBackgroundForSvg(pageContainer);
    const markup = buildStructuredSvgMarkup(
      pageContainer,
      {
        width: Math.max(1, Math.round(pageGeometry.width * pixelRatio)),
        height: Math.max(1, Math.round(pageGeometry.height * pixelRatio))
      },
      { mapLibreBackgroundDataUrl },
      pageGeometry
    );
    // The SVG draws deck geometry at its on-screen box plus viewport pixels
    // (`projectPosition`): placement follows the same convention.
    const placement =
      opts.onMapPlacement || opts.georeferenceFrame
        ? resolveMapPlacement(pageContainer, 1, [0, 0], 'on-screen')
        : null;
    if (placement) {
      opts.onMapPlacement?.({ ...placement, scale: 1 });
    }
    const frameLayer =
      opts.georeferenceFrame && placement
        ? buildGeoreferenceFrameLayer(placement)
        : '';

    const svg = frameLayer
      ? markup.replace(/<\/svg>\s*$/, `${frameLayer}</svg>`)
      : markup;
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  });
}
export async function exportMapToJpg(
  options: MapExportRequest = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  let placement = null as MapExportPlacement | null;
  await fontAssetsStore.ensureLoaded();
  await fontAssetsStore.whenFontsSettled();

  const pageContainer = document.querySelector(
    EXPORT_PAGE_SELECTOR
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  const pageCanvas = await withPreparedMapExport(
    pageContainer,
    async ({ freezeCanvases, prerenderWebgl }) => {
      const pagePixelRatio = getExportPixelRatio(pageContainer, opts);
      await prerenderWebgl(pagePixelRatio);
      await freezeCanvases();
      placement = opts.onMapPlacement
        ? resolveMapPlacement(pageContainer, pagePixelRatio, [0, 0], 'unscaled')
        : null;

      return await htmlToImageCanvas(pageContainer, {
        pixelRatio: pagePixelRatio,
        backgroundColor: EXPORT_BACKGROUND_COLOR,
        style: { boxShadow: 'none' },
        filter: exportFilter
      });
    }
  );

  if (!pageCanvas) {
    return Promise.reject(new Error(m.error_capture_page_failed()));
  }

  const offscreen = new OffscreenCanvas(opts.width, opts.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error(m.error_export_canvas_context_failed()));
  }

  ctx.fillStyle = EXPORT_BACKGROUND_COLOR;
  ctx.fillRect(0, 0, opts.width, opts.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const drawX = Math.round((opts.width - pageCanvas.width) / 2);
  const drawY = Math.round((opts.height - pageCanvas.height) / 2);
  ctx.drawImage(pageCanvas, drawX, drawY);
  if (placement) {
    opts.onMapPlacement?.({
      ...placement,
      offsetX: placement.offsetX + drawX,
      offsetY: placement.offsetY + drawY
    });
  }

  return offscreen.convertToBlob({
    type: 'image/jpeg',
    quality: JPEG_EXPORT_QUALITY
  });
}
