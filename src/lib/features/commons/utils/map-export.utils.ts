import * as m from '$lib/paraglide/messages';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import { toCanvas as htmlToImageCanvas } from 'html-to-image';

interface ExportOptions {
  width: number;
  height: number;
}

interface RelativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SVG_EXPORT_STYLE_PROPERTIES = [
  'color',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'text-anchor',
  'dominant-baseline',
  'opacity',
  'vector-effect'
] as const;

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080
};

function getExportPixelRatio(
  pageContainer: HTMLElement,
  options: ExportOptions
): number {
  return Math.min(
    options.width / pageContainer.offsetWidth,
    options.height / pageContainer.offsetHeight
  );
}

function exportFilter(domNode: HTMLElement): boolean {
  if (domNode.classList?.contains('page-grid')) return false;
  if (domNode.classList?.contains('view-mode-loader')) return false;
  return true;
}

function usesInterleavedDeckOverlay(): boolean {
  return mapInstanceStore.deckOverlay !== null;
}

async function prerenderWebgl(pixelRatio: number): Promise<() => void> {
  const map = mapInstanceStore.map;
  if (!map || usesInterleavedDeckOverlay()) return () => {};

  const currentRatio = map.getPixelRatio();
  const scale = Math.max(pixelRatio, currentRatio);

  if (scale <= currentRatio) return () => {};

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(m.error_map_render_timeout())),
      10000
    );

    map.once('render', () => {
      clearTimeout(timeout);
      resolve();
    });
    map.setPixelRatio(scale);
    map.triggerRepaint();
  });

  return () => {
    requestAnimationFrame(() => {
      map.setPixelRatio(currentRatio);
      map.triggerRepaint();
    });
  };
}

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

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toMultilineHtml(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br />');
}

function isTransparentColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === 'transparent' ||
    normalized === 'rgba(0, 0, 0, 0)'
  );
}

function getRelativeRect(
  element: Element,
  container: HTMLElement
): RelativeRect {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return {
    x: elementRect.left - containerRect.left,
    y: elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height
  };
}

function roundSvgValue(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : '0';
}

function parseCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSvgComputedStyle(element: SVGElement): string {
  const computed = getComputedStyle(element);

  return SVG_EXPORT_STYLE_PROPERTIES.map((property) => {
    if (property !== 'color' && element.hasAttribute(property)) {
      return '';
    }

    const value = computed.getPropertyValue(property).trim();
    return value ? `${property}: ${value}` : '';
  })
    .filter(Boolean)
    .join('; ');
}

function inlineSvgComputedStyles(source: SVGElement, clone: SVGElement): void {
  const computedStyle = getSvgComputedStyle(source);
  const existingStyle = clone.getAttribute('style')?.trim();
  const style = [existingStyle, computedStyle].filter(Boolean).join('; ');

  if (style) {
    clone.setAttribute('style', style);
  }

  const sourceChildren = Array.from(source.children).filter(
    (child): child is SVGElement => child instanceof SVGElement
  );
  const cloneChildren = Array.from(clone.children).filter(
    (child): child is SVGElement => child instanceof SVGElement
  );

  sourceChildren.forEach((sourceChild, index) => {
    const cloneChild = cloneChildren[index];
    if (cloneChild) {
      inlineSvgComputedStyles(sourceChild, cloneChild);
    }
  });
}

function serializeSvgNode(
  element: SVGElement,
  position?: Partial<RelativeRect>
): string {
  const clone = element.cloneNode(true) as SVGElement;
  inlineSvgComputedStyles(element, clone);

  if (position?.x !== undefined) {
    clone.setAttribute('x', roundSvgValue(position.x));
  }
  if (position?.y !== undefined) {
    clone.setAttribute('y', roundSvgValue(position.y));
  }
  if (position?.width !== undefined) {
    clone.setAttribute('width', roundSvgValue(position.width));
  }
  if (position?.height !== undefined) {
    clone.setAttribute('height', roundSvgValue(position.height));
  }

  return new XMLSerializer().serializeToString(clone);
}

function buildElementBackgroundRect(
  element: HTMLElement,
  width: number,
  height: number
): string {
  const styles = getComputedStyle(element);
  const backgroundColor = styles.backgroundColor;
  const borderWidth = Math.max(
    parseCssPixels(styles.borderTopWidth),
    parseCssPixels(styles.borderRightWidth),
    parseCssPixels(styles.borderBottomWidth),
    parseCssPixels(styles.borderLeftWidth)
  );
  const hasBorder =
    borderWidth > 0 &&
    styles.borderStyle !== 'none' &&
    !isTransparentColor(styles.borderColor);

  if (isTransparentColor(backgroundColor) && !hasBorder) {
    return '';
  }

  const radius = parseCssPixels(styles.borderTopLeftRadius);
  const fill = isTransparentColor(backgroundColor) ? 'none' : backgroundColor;
  const strokeAttributes = hasBorder
    ? `stroke="${escapeXml(styles.borderColor)}" stroke-width="${roundSvgValue(borderWidth)}"`
    : 'stroke="none"';

  return `
    <rect
      x="0"
      y="0"
      width="${roundSvgValue(width)}"
      height="${roundSvgValue(height)}"
      rx="${roundSvgValue(radius)}"
      ry="${roundSvgValue(radius)}"
      fill="${escapeXml(fill)}"
      ${strokeAttributes}
      opacity="${escapeXml(styles.opacity || '1')}"
    />
  `;
}

function getTextForeignObjectStyle(element: HTMLElement): string {
  const computed = getComputedStyle(element);
  const styles = [
    `box-sizing: border-box`,
    `display: block`,
    `width: 100%`,
    `height: 100%`,
    `margin: 0`,
    `padding: ${computed.padding}`,
    `background: ${computed.background}`,
    `border-radius: ${computed.borderRadius}`,
    `box-shadow: ${computed.boxShadow}`,
    `color: ${computed.color}`,
    `font-family: ${computed.fontFamily}`,
    `font-size: ${computed.fontSize}`,
    `font-style: ${computed.fontStyle}`,
    `font-weight: ${computed.fontWeight}`,
    `letter-spacing: ${computed.letterSpacing}`,
    `line-height: ${computed.lineHeight}`,
    `text-align: ${computed.textAlign}`,
    `text-decoration: ${computed.textDecoration}`,
    `white-space: pre-wrap`,
    `opacity: ${computed.opacity}`,
    `overflow: visible`
  ];

  return styles.join('; ');
}

function buildTextForeignObject(
  element: HTMLElement,
  rect: RelativeRect,
  id: string
): string {
  const text = element.textContent?.trim() ?? '';
  if (!text || rect.width <= 0 || rect.height <= 0) {
    return '';
  }

  const style = getTextForeignObjectStyle(element);

  return `
    <g id="${escapeXml(id)}">
      <foreignObject
        x="${roundSvgValue(rect.x)}"
        y="${roundSvgValue(rect.y)}"
        width="${roundSvgValue(rect.width)}"
        height="${roundSvgValue(rect.height)}"
      >
        <div xmlns="http://www.w3.org/1999/xhtml" style="${escapeXml(style)}">${toMultilineHtml(text)}</div>
      </foreignObject>
    </g>
  `;
}

function buildImageLayer(
  image: HTMLImageElement,
  rect: RelativeRect,
  id: string
): string {
  const href = image.currentSrc || image.src;
  if (!href || rect.width <= 0 || rect.height <= 0) {
    return '';
  }

  const computed = getComputedStyle(image);

  return `
    <g id="${escapeXml(id)}">
      <image
        x="${roundSvgValue(rect.x)}"
        y="${roundSvgValue(rect.y)}"
        width="${roundSvgValue(rect.width)}"
        height="${roundSvgValue(rect.height)}"
        href="${escapeXml(href)}"
        opacity="${escapeXml(computed.opacity || '1')}"
        preserveAspectRatio="none"
      />
    </g>
  `;
}

function buildLegendLayer(pageContainer: HTMLElement): string {
  const legendContainer = pageContainer.querySelector(
    '.legend-container'
  ) as HTMLElement | null;
  if (!legendContainer) {
    return '';
  }

  const legendRect = getRelativeRect(legendContainer, pageContainer);
  if (legendRect.width <= 0 || legendRect.height <= 0) {
    return '';
  }

  const styles = getComputedStyle(legendContainer);
  const parts: string[] = [];

  if (!isTransparentColor(styles.backgroundColor)) {
    parts.push(`
      <rect
        x="0"
        y="0"
        width="${roundSvgValue(legendRect.width)}"
        height="${roundSvgValue(legendRect.height)}"
        fill="${escapeXml(styles.backgroundColor)}"
      />
    `);
  }

  const legendSvgs = legendContainer.querySelectorAll<SVGSVGElement>('svg');
  legendSvgs.forEach((svg, index) => {
    const svgRect = getRelativeRect(svg, legendContainer);
    parts.push(
      serializeSvgNode(svg, {
        x: svgRect.x,
        y: svgRect.y,
        width: svgRect.width,
        height: svgRect.height
      }).replace('<svg', `<svg id="khartis-legend-segment-${index + 1}"`)
    );
  });

  if (parts.length === 0) {
    const legendItem = legendContainer.querySelector('.legend-item');
    if (legendItem instanceof HTMLElement) {
      parts.push(
        buildTextForeignObject(
          legendItem,
          {
            x: 0,
            y: 0,
            width: legendRect.width,
            height: legendRect.height
          },
          'khartis-legend-text'
        )
      );
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return `
    <g
      id="khartis-layer-legend"
      transform="translate(${roundSvgValue(legendRect.x)}, ${roundSvgValue(legendRect.y)})"
    >
      ${parts.join('')}
    </g>
  `;
}

function getGeoIndicationId(element: HTMLElement, index: number): string {
  if (element.classList.contains('scale-bar')) {
    return 'scale';
  }

  if (element.classList.contains('north-arrow')) {
    return 'orientation';
  }

  if (element.classList.contains('inset-map-panel')) {
    return 'inset-map';
  }

  return `item-${index + 1}`;
}

function buildGeoIndicationsLayer(pageContainer: HTMLElement): string {
  const geoItems = pageContainer.querySelectorAll<HTMLElement>(
    '.geo-indications-overlay .scale-bar, .geo-indications-overlay .north-arrow, .geo-indications-overlay .inset-map-panel'
  );

  if (geoItems.length === 0) {
    return '';
  }

  const parts: string[] = [];

  geoItems.forEach((item, index) => {
    const itemRect = getRelativeRect(item, pageContainer);
    if (itemRect.width <= 0 || itemRect.height <= 0) {
      return;
    }

    const itemParts = [
      buildElementBackgroundRect(item, itemRect.width, itemRect.height)
    ];

    const svgs = item.querySelectorAll<SVGSVGElement>('svg');
    svgs.forEach((svg, svgIndex) => {
      const svgRect = getRelativeRect(svg, item);
      itemParts.push(
        serializeSvgNode(svg, {
          x: svgRect.x,
          y: svgRect.y,
          width: svgRect.width,
          height: svgRect.height
        }).replace(
          '<svg',
          `<svg id="khartis-geo-indication-${getGeoIndicationId(item, index)}-${svgIndex + 1}"`
        )
      );
    });

    const itemMarkup = itemParts.filter(Boolean).join('');
    if (!itemMarkup) {
      return;
    }

    parts.push(`
      <g
        id="khartis-geo-indication-${getGeoIndicationId(item, index)}"
        transform="translate(${roundSvgValue(itemRect.x)}, ${roundSvgValue(itemRect.y)})"
      >
        ${itemMarkup}
      </g>
    `);
  });

  if (parts.length === 0) {
    return '';
  }

  return `
    <g id="khartis-layer-geo-indications">
      ${parts.join('')}
    </g>
  `;
}

function buildAnnotationLayer(pageContainer: HTMLElement): string {
  const annotationItems = pageContainer.querySelectorAll<HTMLElement>(
    '.annotation-overlay .annotation-item'
  );

  if (annotationItems.length === 0) {
    return '';
  }

  const parts: string[] = [];

  annotationItems.forEach((item, index) => {
    const role = item.dataset.annotationRole || item.dataset.annotationType;
    const id = `khartis-annotation-${role ?? 'item'}-${index + 1}`;
    const textElement = item.querySelector('.annotation-text');
    if (textElement instanceof HTMLElement) {
      parts.push(
        buildTextForeignObject(
          textElement,
          getRelativeRect(item, pageContainer),
          id
        )
      );
      return;
    }

    const svgElement = item.querySelector('svg');
    if (svgElement instanceof SVGElement) {
      const svgRect = getRelativeRect(svgElement, pageContainer);
      parts.push(`
        <g id="${escapeXml(id)}">
          ${serializeSvgNode(svgElement, {
            x: svgRect.x,
            y: svgRect.y,
            width: svgRect.width,
            height: svgRect.height
          })}
        </g>
      `);
      return;
    }

    const imageElement = item.querySelector('img');
    if (imageElement instanceof HTMLImageElement) {
      parts.push(
        buildImageLayer(
          imageElement,
          getRelativeRect(imageElement, pageContainer),
          id
        )
      );
    }
  });

  if (parts.length === 0) {
    return '';
  }

  return `
    <g id="khartis-layer-annotations">
      ${parts.join('')}
    </g>
  `;
}

function buildVisualizationLayer(pageContainer: HTMLElement): string {
  const mapCanvas = resolveMapCanvas(pageContainer);

  if (!mapCanvas) {
    return '';
  }

  const canvasRect = getRelativeRect(mapCanvas, pageContainer);
  const canvasDataUrl = mapCanvas.toDataURL('image/png');
  const parts = [
    `
      <image
        x="${roundSvgValue(canvasRect.x)}"
        y="${roundSvgValue(canvasRect.y)}"
        width="${roundSvgValue(canvasRect.width)}"
        height="${roundSvgValue(canvasRect.height)}"
        href="${escapeXml(canvasDataUrl)}"
        preserveAspectRatio="none"
      />
    `
  ];

  const projectionMask = pageContainer.querySelector(
    '.projection-mask-overlay'
  ) as SVGSVGElement | null;
  if (projectionMask) {
    const maskRect = getRelativeRect(projectionMask, pageContainer);
    parts.push(
      serializeSvgNode(projectionMask, {
        x: maskRect.x,
        y: maskRect.y,
        width: maskRect.width,
        height: maskRect.height
      })
    );
  }

  return `
    <g id="khartis-layer-visualizations">
      ${parts.join('')}
    </g>
  `;
}

function resolveMapCanvas(
  pageContainer: HTMLElement
): HTMLCanvasElement | null {
  return (
    mapInstanceStore.getMapCanvas() ??
    (pageContainer.querySelector(
      '.map-canvas canvas, .shared-facets-canvas canvas, canvas'
    ) as HTMLCanvasElement | null)
  );
}

function buildStructuredSvgMarkup(
  pageContainer: HTMLElement,
  options: ExportOptions
): string {
  const width = Math.max(1, pageContainer.offsetWidth);
  const height = Math.max(1, pageContainer.offsetHeight);
  const backgroundColor =
    getComputedStyle(pageContainer).backgroundColor || '#ffffff';
  const layers = [
    buildVisualizationLayer(pageContainer),
    buildLegendLayer(pageContainer),
    buildGeoIndicationsLayer(pageContainer),
    buildAnnotationLayer(pageContainer)
  ].filter(Boolean);

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${roundSvgValue(options.width)}"
      height="${roundSvgValue(options.height)}"
      viewBox="0 0 ${roundSvgValue(width)} ${roundSvgValue(height)}"
      preserveAspectRatio="xMidYMid meet"
    >
      <g id="khartis-layer-page">
        <rect
          x="0"
          y="0"
          width="${roundSvgValue(width)}"
          height="${roundSvgValue(height)}"
          fill="${escapeXml(backgroundColor)}"
        />
      </g>
      ${layers.join('')}
    </svg>
  `.trim();
}

export async function exportMapToSvg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  await fontAssetsStore.ensureLoaded();

  const pageContainer = document.querySelector(
    '.page-container'
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  const pixelRatio = getExportPixelRatio(pageContainer, opts);

  const restoreRatio = await prerenderWebgl(pixelRatio);
  const restoreDom = mutateDomForExport(pageContainer);
  await waitForNextFrame();

  try {
    const markup = buildStructuredSvgMarkup(pageContainer, {
      width: Math.max(1, Math.round(pageContainer.offsetWidth * pixelRatio)),
      height: Math.max(1, Math.round(pageContainer.offsetHeight * pixelRatio))
    });

    return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  } finally {
    restoreDom();
    restoreRatio();
  }
}

export async function exportMapToJpg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  await fontAssetsStore.ensureLoaded();

  const pageContainer = document.querySelector(
    '.page-container'
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  const pagePixelRatio = getExportPixelRatio(pageContainer, opts);

  const restoreRatio = await prerenderWebgl(pagePixelRatio);
  const restoreDom = mutateDomForExport(pageContainer);
  await waitForNextFrame();

  const pageCanvas = await (async (): Promise<HTMLCanvasElement | null> => {
    try {
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
    return Promise.reject(new Error(m.error_capture_page_failed()));
  }

  const offscreen = new OffscreenCanvas(opts.width, opts.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error(m.error_export_canvas_context_failed()));
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
