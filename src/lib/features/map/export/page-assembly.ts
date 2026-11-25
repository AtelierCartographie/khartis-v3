import { globalActions } from '$lib/features/commons/stores/global.svelte';
import * as m from '$lib/paraglide/messages';
import {
  EXPORT_MAP_STAGE_SELECTOR,
  EXPORT_MAP_SURFACE_SELECTOR,
  SVG_MAP_FRAME_CLIP_ID
} from './constants';
import {
  buildAnnotationLayer,
  buildGeoIndicationsLayers,
  buildLegendLayers,
  buildTopLevelLayer,
  buildVisualizationLayer,
  resetDropShadowFilterIds
} from './page-elements';
import { cssPaintAttributes, isTransparentColor } from './svg-color';
import { svgPatternDefsCache } from './svg-patterns';
import {
  type SvgIdDeduper,
  createSvgIdDeduper,
  getRelativeRect,
  resolvePageExportGeometry,
  roundSvgValue
} from './svg-values';
import type {
  ExportOptions,
  MapExportPlacement,
  PageExportGeometry,
  RestoreExportRender,
  StructuredSvgOptions
} from './types';
import {
  freezeCanvasesForExport,
  mutateDomForExport,
  prerenderWebgl,
  resolveMapCanvas,
  waitForNextFrame
} from './webgl-prerender';

// `imageScale` maps page pixels to image pixels: the JPG renders the page
// unscaled (offsetWidth) at its pixel ratio, the SVG keeps the page's
// on-screen box as its user units.
export function resolveMapPlacement(
  pageContainer: HTMLElement,
  imageScale: number,
  imageOffset: [number, number],
  pageUnits: 'unscaled' | 'on-screen'
): MapExportPlacement | null {
  if (pageContainer.matches('.facets-page')) {
    return null;
  }
  const canvas = resolveMapCanvas(pageContainer);
  if (!canvas || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
    return null;
  }

  const rect = getRelativeRect(canvas, pageContainer);
  const pageScale =
    pageUnits === 'unscaled' && pageContainer.offsetWidth > 0
      ? pageContainer.getBoundingClientRect().width / pageContainer.offsetWidth
      : 1;
  const viewportToPage = rect.width / pageScale / canvas.clientWidth;

  return {
    scale: imageScale * viewportToPage,
    offsetX: imageOffset[0] + imageScale * (rect.x / pageScale),
    offsetY: imageOffset[1] + imageScale * (rect.y / pageScale),
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight
  };
}
// An empty rectangle on the map frame: the same frame, exported from QGIS
// out of the georeferencing GeoPackage, lines up on it in a drawing tool.
export function buildGeoreferenceFrameLayer(
  placement: MapExportPlacement
): string {
  return buildTopLevelLayer(
    m.svg_export_layer_georeference_frame(),
    `
      <rect
        id="khartis-georeference-frame"
        x="${roundSvgValue(placement.offsetX)}"
        y="${roundSvgValue(placement.offsetY)}"
        width="${roundSvgValue(placement.viewportWidth)}"
        height="${roundSvgValue(placement.viewportHeight)}"
        fill="none"
        stroke="none"
      />
    `,
    createSvgIdDeduper()
  );
}

function resolveElementBackgroundColor(
  element: HTMLElement,
  fallback: string
): string {
  const backgroundColor = getComputedStyle(element).backgroundColor;

  return isTransparentColor(backgroundColor) ? fallback : backgroundColor;
}

function buildPageLayer(
  pageContainer: HTMLElement,
  geometry: PageExportGeometry,
  dedupeId: SvgIdDeduper
): string {
  const pageBackgroundColor = resolveElementBackgroundColor(
    pageContainer,
    '#ffffff'
  );
  const parts = [
    `
      <rect
        id="khartis-page-background"
        x="0"
        y="0"
        width="${roundSvgValue(geometry.width)}"
        height="${roundSvgValue(geometry.height)}"
        ${cssPaintAttributes('fill', pageBackgroundColor)}
      />
    `
  ];

  const mapStage = pageContainer.querySelector(
    EXPORT_MAP_STAGE_SELECTOR
  ) as HTMLElement | null;
  const mapSurface =
    (mapStage?.querySelector(
      EXPORT_MAP_SURFACE_SELECTOR
    ) as HTMLElement | null) ?? mapStage;
  const mapBackgroundColor = mapSurface
    ? resolveElementBackgroundColor(mapSurface, '')
    : '';

  if (
    geometry.mapFrame &&
    mapBackgroundColor &&
    mapBackgroundColor !== pageBackgroundColor
  ) {
    parts.push(`
      <rect
        id="khartis-map-frame-background"
        x="${roundSvgValue(geometry.mapFrame.x)}"
        y="${roundSvgValue(geometry.mapFrame.y)}"
        width="${roundSvgValue(geometry.mapFrame.width)}"
        height="${roundSvgValue(geometry.mapFrame.height)}"
        ${cssPaintAttributes('fill', mapBackgroundColor)}
      />
    `);
  }

  return buildTopLevelLayer(
    m.svg_export_layer_page(),
    parts.join(''),
    dedupeId
  );
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

  definitions.push(
    ...Array.from(svgPatternDefsCache.values()).map((entry) => entry.defsHtml)
  );

  if (definitions.length === 0) {
    return '';
  }

  return `
    <defs>
      ${definitions.join('\n')}
    </defs>
  `;
}

export function buildStructuredSvgMarkup(
  pageContainer: HTMLElement,
  options: ExportOptions,
  structuredOptions: StructuredSvgOptions = {},
  geometry: PageExportGeometry = resolvePageExportGeometry(pageContainer)
): string {
  svgPatternDefsCache.clear();
  resetDropShadowFilterIds();
  const dedupeId = createSvgIdDeduper();
  const layers = [
    buildPageLayer(pageContainer, geometry, dedupeId),
    buildVisualizationLayer(
      pageContainer,
      dedupeId,
      structuredOptions,
      geometry
    ),
    buildLegendLayers(pageContainer, dedupeId),
    ...buildGeoIndicationsLayers(pageContainer, dedupeId),
    buildAnnotationLayer(pageContainer, dedupeId)
  ].filter(Boolean);

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
      width="${roundSvgValue(options.width)}"
      height="${roundSvgValue(options.height)}"
      viewBox="0 0 ${roundSvgValue(geometry.width)} ${roundSvgValue(geometry.height)}"
      preserveAspectRatio="xMidYMid meet"
    >
      ${buildSvgDefinitions(geometry)}
      ${layers.join('')}
    </svg>
  `.trim();
}
interface PreparedMapExportContext {
  prerenderWebgl(pixelRatio: number): Promise<void>;
  freezeCanvases(): Promise<void>;
}
export async function withPreparedMapExport<T>(
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
