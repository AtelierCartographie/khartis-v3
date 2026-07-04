import * as m from '$lib/paraglide/messages';
import { globalActions } from '$lib/features/commons/stores/global.svelte';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import { toCanvas as htmlToImageCanvas } from 'html-to-image';
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_PAGE_SELECTOR,
  SVG_MAP_FRAME_CLIP_ID,
  exportFilter,
  freezeCanvasesForExport,
  getExportPixelRatio,
  getExportPixelRatioForSize,
  mutateDomForExport,
  prerenderWebgl,
  resolveMapCanvas,
  resolvePageExportGeometry,
  roundSvgValue,
  waitForNextFrame,
  type ExportOptions,
  type PageExportGeometry,
  type RestoreExportRender,
  type StructuredSvgOptions
} from './map-export-svg.shared';
import {
  buildCanvasVisualizationFallback,
  buildDeckVisualizationLayer,
  buildMapLibreBackgroundLayer,
  captureMapLibreBackgroundForSvg,
  getSvgPatternDefinitions,
  resetSvgPatternDefinitions
} from './map-export-deck-svg';
import {
  buildAnnotationLayer,
  buildGeoIndicationsLayer,
  buildLegendLayer,
  buildPageLayer,
  resetPageSvgSerializationState
} from './map-export-page-svg';

const EXPORT_BACKGROUND_COLOR = '#ffffff';
const JPEG_EXPORT_QUALITY = 1.0;

function buildVisualizationLayer(
  pageContainer: HTMLElement,
  structuredOptions: StructuredSvgOptions = {},
  geometry: PageExportGeometry = resolvePageExportGeometry(pageContainer)
): string {
  const mapCanvas = resolveMapCanvas(pageContainer);

  if (!mapCanvas) {
    return '';
  }

  const deckLayer = buildDeckVisualizationLayer(pageContainer, mapCanvas);
  const parts = [
    deckLayer
      ? buildMapLibreBackgroundLayer(
          pageContainer,
          mapCanvas,
          structuredOptions.mapLibreBackgroundDataUrl
        )
      : '',
    deckLayer || buildCanvasVisualizationFallback(pageContainer, mapCanvas)
  ].filter(Boolean);

  if (parts.length === 0) {
    return '';
  }

  return `
    <g
      id="khartis-layer-visualizations"
      ${geometry.mapFrame ? `clip-path="url(#${SVG_MAP_FRAME_CLIP_ID})"` : ''}
    >
      ${parts.join('')}
    </g>
  `;
}

function buildSvgDefinitions(geometry: PageExportGeometry): string {
  const definitions: string[] = [];

  if (geometry.mapFrame) {
    definitions.push(`
      <clipPath id="${SVG_MAP_FRAME_CLIP_ID}">
        <rect
          x="${roundSvgValue(geometry.mapFrame.x)}"
          y="${roundSvgValue(geometry.mapFrame.y)}"
          width="${roundSvgValue(geometry.mapFrame.width)}"
          height="${roundSvgValue(geometry.mapFrame.height)}"
        />
      </clipPath>
    `);
  }

  definitions.push(...getSvgPatternDefinitions());

  if (definitions.length === 0) {
    return '';
  }

  return `
    <defs>
      ${definitions.join('\n')}
    </defs>
  `;
}

function buildStructuredSvgMarkup(
  pageContainer: HTMLElement,
  options: ExportOptions,
  structuredOptions: StructuredSvgOptions = {},
  geometry: PageExportGeometry = resolvePageExportGeometry(pageContainer)
): string {
  resetSvgPatternDefinitions();
  resetPageSvgSerializationState();
  const layers = [
    buildVisualizationLayer(pageContainer, structuredOptions, geometry),
    buildLegendLayer(pageContainer),
    buildGeoIndicationsLayer(pageContainer),
    buildAnnotationLayer(pageContainer)
  ].filter(Boolean);

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${roundSvgValue(options.width)}"
      height="${roundSvgValue(options.height)}"
      viewBox="0 0 ${roundSvgValue(geometry.width)} ${roundSvgValue(geometry.height)}"
      preserveAspectRatio="xMidYMid meet"
    >
      ${buildSvgDefinitions(geometry)}
      ${buildPageLayer(pageContainer, geometry)}
      ${layers.join('')}
    </svg>
  `.trim();
}

interface PreparedMapExportContext {
  prerenderWebgl(pixelRatio: number): Promise<void>;
  freezeCanvases(): Promise<void>;
}

async function withPreparedMapExport<T>(
  pageContainer: HTMLElement,
  operation: (context: PreparedMapExportContext) => Promise<T>
): Promise<T> {
  let restoreRatio: RestoreExportRender = async () => {};
  let restoreDom = (): void => {};
  let restoreFrozenCanvases: RestoreExportRender = async () => {};
  let shouldRestoreExportMode = false;

  try {
    restoreDom = mutateDomForExport(pageContainer);
    globalActions.setMapExporting(true);
    shouldRestoreExportMode = true;
    await waitForNextFrame();

    return await operation({
      async prerenderWebgl(pixelRatio) {
        restoreRatio = await prerenderWebgl(pixelRatio);
        await waitForNextFrame();
      },
      async freezeCanvases() {
        restoreFrozenCanvases = await freezeCanvasesForExport(pageContainer);
        await waitForNextFrame();
      }
    });
  } finally {
    await restoreFrozenCanvases();
    await restoreRatio();
    if (shouldRestoreExportMode) {
      globalActions.setMapExporting(false);
    }
    restoreDom();
    await waitForNextFrame();
  }
}

export async function exportMapToSvg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  await fontAssetsStore.ensureLoaded();

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

    return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  });
}

export async function exportMapToJpg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  await fontAssetsStore.ensureLoaded();

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
  ctx.drawImage(
    pageCanvas,
    Math.round((opts.width - pageCanvas.width) / 2),
    Math.round((opts.height - pageCanvas.height) / 2)
  );

  return offscreen.convertToBlob({
    type: 'image/jpeg',
    quality: JPEG_EXPORT_QUALITY
  });
}
