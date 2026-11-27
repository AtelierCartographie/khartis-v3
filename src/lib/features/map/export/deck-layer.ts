import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import {
  getLayerProps,
  getLayerTypeName,
  getViewportId,
  getViewportNumber,
  resolveActiveDeckForSvg,
  resolveDeckLayers,
  resolveDeckViewports,
  shouldRenderLayerInViewport
} from './deck-layers';
import { serializeGeoJsonLayer } from './geojson-layer';
import { serializePathLayer } from './path-layer';
import { serializePointLayer } from './point-layer';
import { serializePolygonLayer } from './polygon-layer';
import { escapeXml } from './svg-color';
import { buildLayerGroup } from './svg-projection';
import {
  createSvgIdDeduper,
  getRelativeRect,
  isRecord,
  roundSvgValue,
  sanitizeSvgId
} from './svg-values';
import { serializeLabelLeaderLayer, serializeTextLayer } from './text-layer';
import type {
  RelativeRect,
  SvgDeckLayerLike,
  SvgProjectionContext
} from './types';
import { resolveMapCanvas, waitForMapRender } from './webgl-prerender';

function serializeDeckLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  if (props.visible === false) return '';

  const layerTypeName = getLayerTypeName(layer);

  if (layerTypeName.includes('LabelLeaderLayer')) {
    return serializeLabelLeaderLayer(layer, context);
  }

  if (
    layerTypeName.includes('ScatterplotLayer') ||
    layerTypeName.includes('MultiShapeLayer')
  ) {
    return serializePointLayer(layer, context);
  }

  if (layerTypeName.includes('PathLayer')) {
    return serializePathLayer(layer, context);
  }

  if (layerTypeName.includes('SolidPolygonLayer')) {
    return serializePolygonLayer(layer, context);
  }

  if (layerTypeName.includes('GeoJsonLayer')) {
    return serializeGeoJsonLayer(layer, context);
  }

  if (layerTypeName.includes('TextLayer')) {
    return serializeTextLayer(layer, context);
  }

  return '';
}

export function buildDeckVisualizationLayer(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement
): string {
  const deck = resolveActiveDeckForSvg();
  const viewports = deck ? resolveDeckViewports(deck) : [];
  if (!deck || viewports.length === 0) return '';

  const canvasRect = getRelativeRect(mapCanvas, pageContainer);
  const layers = resolveDeckLayers(deck);
  const dedupeId = createSvgIdDeduper();

  if (viewports.length === 1) {
    const context: SvgProjectionContext = {
      canvasRect,
      viewport: viewports[0]
    };

    return layers
      .map((layer, index) =>
        buildLayerGroup(
          layer,
          index,
          serializeDeckLayer(layer, context),
          dedupeId
        )
      )
      .filter(Boolean)
      .join('');
  }

  return viewports
    .map((viewport, viewportIndex) => {
      const viewportId = getViewportId(viewport, viewportIndex);
      const viewportRect: RelativeRect = {
        x: canvasRect.x + getViewportNumber(viewport, 'x', 0),
        y: canvasRect.y + getViewportNumber(viewport, 'y', 0),
        width: getViewportNumber(viewport, 'width', canvasRect.width),
        height: getViewportNumber(viewport, 'height', canvasRect.height)
      };
      const context: SvgProjectionContext = {
        canvasRect: viewportRect,
        viewport
      };
      const content = layers
        .map((layer, layerIndex) =>
          shouldRenderLayerInViewport(deck, layer, viewport)
            ? buildLayerGroup(
                layer,
                layerIndex,
                serializeDeckLayer(layer, context),
                dedupeId,
                viewportId
              )
            : ''
        )
        .filter(Boolean)
        .join('');

      if (!content) {
        return '';
      }

      const clipId = `khartis-deck-viewport-${sanitizeSvgId(viewportId)}-clip`;

      return `
        <clipPath id="${escapeXml(clipId)}">
          <rect
            x="${roundSvgValue(viewportRect.x)}"
            y="${roundSvgValue(viewportRect.y)}"
            width="${roundSvgValue(viewportRect.width)}"
            height="${roundSvgValue(viewportRect.height)}"
          />
        </clipPath>
        <g
          id="khartis-deck-viewport-${escapeXml(sanitizeSvgId(viewportId))}"
          data-khartis-viewport-id="${escapeXml(viewportId)}"
          clip-path="url(#${escapeXml(clipId)})"
        >
          ${content}
        </g>
      `;
    })
    .filter(Boolean)
    .join('');
}

function buildMapCanvasImageLayer(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement,
  canvasDataUrl: string,
  exportMode: string
): string {
  const canvasRect = getRelativeRect(mapCanvas, pageContainer);

  if (!canvasDataUrl || canvasDataUrl === 'data:,') {
    return '';
  }

  return `
    <image
      x="${roundSvgValue(canvasRect.x)}"
      y="${roundSvgValue(canvasRect.y)}"
      width="${roundSvgValue(canvasRect.width)}"
      height="${roundSvgValue(canvasRect.height)}"
      href="${escapeXml(canvasDataUrl)}"
      preserveAspectRatio="none"
      data-khartis-export-mode="${escapeXml(exportMode)}"
    />
  `;
}

export function buildCanvasVisualizationFallback(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement
): string {
  let canvasDataUrl: string;

  try {
    canvasDataUrl = mapCanvas.toDataURL('image/png');
  } catch {
    return '';
  }

  return buildMapCanvasImageLayer(
    pageContainer,
    mapCanvas,
    canvasDataUrl,
    'raster-fallback'
  );
}
export function buildMapLibreBackgroundLayer(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement,
  dataUrl: string | null | undefined
): string {
  if (!dataUrl) return '';

  return buildMapCanvasImageLayer(
    pageContainer,
    mapCanvas,
    dataUrl,
    'maplibre-background'
  );
}
export async function captureMapLibreBackgroundForSvg(
  pageContainer: HTMLElement
): Promise<string | null> {
  const map = mapInstanceStore.map;
  if (!map || typeof map.once !== 'function') return null;

  const mapCanvas = resolveMapCanvas(pageContainer);
  if (!mapCanvas) return null;

  const deck = resolveActiveDeckForSvg();
  const overlay = mapInstanceStore.deckOverlay as unknown;
  const previousLayers = deck?.props?.layers;
  const layers = Array.isArray(previousLayers)
    ? previousLayers
    : deck
      ? resolveDeckLayers(deck)
      : [];
  const overlaySetProps =
    isRecord(overlay) && typeof overlay.setProps === 'function'
      ? (overlay.setProps as (props: Record<string, unknown>) => void).bind(
          overlay
        )
      : null;
  const deckSetProps =
    deck && typeof deck.setProps === 'function'
      ? deck.setProps.bind(deck)
      : null;
  const setLayers = overlaySetProps ?? deckSetProps;

  if (!setLayers || layers.length === 0) {
    return null;
  }

  try {
    setLayers({ layers: [] });
    await waitForMapRender(map);
    return mapCanvas.toDataURL('image/png');
  } catch (error) {
    logger.warn(
      'Failed to capture MapLibre background for SVG export',
      LogCategory.EXPORT,
      {
        error,
        flow: 'svg_export_maplibre_background',
        extra: {
          layerCount: layers.length,
          canvasWidth: mapCanvas.width,
          canvasHeight: mapCanvas.height
        }
      }
    );
    return null;
  } finally {
    try {
      setLayers({ layers });
      await waitForMapRender(map);
    } catch {
      // Keep SVG export usable even if the temporary background capture fails.
    }
  }
}
