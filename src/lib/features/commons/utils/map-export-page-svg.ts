import {
  EXPORT_MAP_STAGE_SELECTOR,
  EXPORT_MAP_SURFACE_SELECTOR,
  SVG_EXPORT_STYLE_PROPERTIES,
  escapeXml,
  getRelativeRect,
  isTransparentColor,
  parseBoxShadow,
  parseCssPixels,
  roundSvgValue,
  type PageExportGeometry,
  type ParsedBoxShadow,
  type RelativeRect
} from './map-export-svg.shared';

const DEFAULT_PAGE_BACKGROUND_COLOR = '#ffffff';
const DEFAULT_TEXT_LINE_HEIGHT_RATIO = 1.2;
const DEFAULT_TEXT_LINE_HEIGHT_PX = 12;
const NATIVE_TEXT_LINE_Y_TOLERANCE_PX = 1.5;
const NODE_FILTER_SHOW_TEXT = 4;

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

let dropShadowFilterCounter = 0;

export function resetPageSvgSerializationState(): void {
  dropShadowFilterCounter = 0;
}

function buildDropShadowFilter(shadow: ParsedBoxShadow): {
  id: string;
  markup: string;
} {
  dropShadowFilterCounter += 1;
  const id = `khartis-drop-shadow-${dropShadowFilterCounter}`;
  const markup = `
    <filter
      id="${id}"
      x="-20%"
      y="-20%"
      width="140%"
      height="140%"
    >
      <feDropShadow
        dx="${roundSvgValue(shadow.offsetX)}"
        dy="${roundSvgValue(shadow.offsetY)}"
        stdDeviation="${roundSvgValue(shadow.blur / 2)}"
        flood-color="${escapeXml(shadow.color)}"
        flood-opacity="${roundSvgValue(shadow.opacity)}"
      />
    </filter>
  `;
  return { id, markup };
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
  const shadow = parseBoxShadow(styles.boxShadow);
  const filter = shadow ? buildDropShadowFilter(shadow) : null;

  return `
    ${filter ? filter.markup : ''}
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
      ${filter ? `filter="url(#${filter.id})"` : ''}
    />
  `;
}

function resolveLineHeight(computed: CSSStyleDeclaration): number {
  const lineHeight = parseCssPixels(computed.lineHeight);
  if (lineHeight > 0) return lineHeight;

  const fontSize = parseCssPixels(computed.fontSize);
  return fontSize > 0
    ? fontSize * DEFAULT_TEXT_LINE_HEIGHT_RATIO
    : DEFAULT_TEXT_LINE_HEIGHT_PX;
}

function resolveTextAnchor(textAlign: string): string {
  if (textAlign === 'center') return 'middle';
  if (textAlign === 'right' || textAlign === 'end') return 'end';
  return 'start';
}

function resolveAlignedTextX(
  rect: RelativeRect,
  computed: CSSStyleDeclaration
): number {
  const leftPadding = parseCssPixels(computed.paddingLeft);
  const rightPadding = parseCssPixels(computed.paddingRight);
  const textAlign = computed.textAlign;

  if (textAlign === 'center') {
    return rect.x + leftPadding + (rect.width - leftPadding - rightPadding) / 2;
  }

  if (textAlign === 'right' || textAlign === 'end') {
    return rect.x + rect.width - rightPadding;
  }

  return rect.x + leftPadding;
}

interface NativeTextLine {
  text: string;
  x: number;
  y: number;
}

function collectTextNodes(element: HTMLElement): Text[] {
  const showText =
    typeof NodeFilter !== 'undefined'
      ? NodeFilter.SHOW_TEXT
      : NODE_FILTER_SHOW_TEXT;
  const walker = document.createTreeWalker(element, showText);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    if (node instanceof Text) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  return textNodes;
}

function findNativeTextLine(
  lines: NativeTextLine[],
  y: number
): NativeTextLine | null {
  return (
    lines.find(
      (line) => Math.abs(line.y - y) < NATIVE_TEXT_LINE_Y_TOLERANCE_PX
    ) ?? null
  );
}

function collectNativeTextLinesFromRanges(
  element: HTMLElement,
  coordinateContainer: HTMLElement
): NativeTextLine[] {
  if (typeof document.createRange !== 'function') return [];

  const containerRect = coordinateContainer.getBoundingClientRect();
  const lines: NativeTextLine[] = [];
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [];
  let lastLine: NativeTextLine | null = null;

  try {
    for (const textNode of collectTextNodes(element)) {
      const text = textNode.textContent ?? '';

      for (let index = 0; index < text.length; index++) {
        const character = text[index] ?? '';
        if (character === '\n') {
          lastLine = null;
          continue;
        }

        range.setStart(textNode, index);
        range.setEnd(textNode, index + 1);
        const charRect = Array.from(range.getClientRects()).find(
          (rect) => rect.width > 0 || rect.height > 0
        );

        if (!charRect) {
          if (lastLine) {
            lastLine.text += character;
          }
          continue;
        }

        const x = charRect.left - containerRect.left;
        const y = charRect.top - containerRect.top;
        const existingLine = findNativeTextLine(lines, y);
        const line =
          existingLine ??
          ({
            text: '',
            x,
            y
          } satisfies NativeTextLine);

        if (!existingLine) {
          lines.push(line);
        }

        line.text += character;
        line.x = Math.min(line.x, x);
        lastLine = line;
      }
    }
  } finally {
    if (typeof range.detach === 'function') {
      range.detach();
    }
  }

  return lines
    .map((line) => ({ ...line, text: line.text.trimEnd() }))
    .filter((line) => line.text.trim().length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function buildFallbackNativeTextLines(
  text: string,
  rect: RelativeRect,
  computed: CSSStyleDeclaration
): NativeTextLine[] {
  const lineHeight = resolveLineHeight(computed);
  const topPadding = parseCssPixels(computed.paddingTop);
  const x = resolveAlignedTextX(rect, computed);

  return text.split('\n').map((line, index) => ({
    text: line.trimEnd(),
    x,
    y: rect.y + topPadding + lineHeight * index
  }));
}

function buildNativeTextLayer(
  element: HTMLElement,
  rect: RelativeRect,
  id: string,
  coordinateContainer: HTMLElement
): string {
  const text = element.textContent?.trim() ?? '';
  if (!text || rect.width <= 0 || rect.height <= 0) {
    return '';
  }

  const computed = getComputedStyle(element);
  const fontSize = parseCssPixels(computed.fontSize);
  const lineHeight = resolveLineHeight(computed);
  const textAnchor = resolveTextAnchor(computed.textAlign);
  const rangeLines = collectNativeTextLinesFromRanges(
    element,
    coordinateContainer
  );
  const lines =
    rangeLines.length > 0
      ? rangeLines
      : buildFallbackNativeTextLines(text, rect, computed);
  const background = buildElementBackgroundRect(
    element,
    rect.width,
    rect.height
  );
  const transform = `translate(${roundSvgValue(rect.x)}, ${roundSvgValue(rect.y)})`;
  const textDecoration =
    computed.textDecorationLine && computed.textDecorationLine !== 'none'
      ? `text-decoration="${escapeXml(computed.textDecorationLine)}"`
      : '';
  const letterSpacing =
    computed.letterSpacing && computed.letterSpacing !== 'normal'
      ? `letter-spacing="${escapeXml(computed.letterSpacing)}"`
      : '';

  return `
    <g id="${escapeXml(id)}" transform="${transform}">
      ${background}
      ${lines
        .map(
          (line) => `
            <text
              x="${roundSvgValue(line.x - rect.x)}"
              y="${roundSvgValue(line.y - rect.y)}"
              fill="${escapeXml(computed.color)}"
              opacity="${escapeXml(computed.opacity || '1')}"
              font-family="${escapeXml(computed.fontFamily)}"
              font-size="${roundSvgValue(fontSize)}"
              font-style="${escapeXml(computed.fontStyle)}"
              font-weight="${escapeXml(computed.fontWeight)}"
              dominant-baseline="text-before-edge"
              text-anchor="${escapeXml(rangeLines.length > 0 ? 'start' : textAnchor)}"
              line-height="${roundSvgValue(lineHeight)}"
              xml:space="preserve"
              ${letterSpacing}
              ${textDecoration}
            >${escapeXml(line.text)}</text>
          `
        )
        .join('')}
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

export function buildLegendLayer(pageContainer: HTMLElement): string {
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
  const shadow = parseBoxShadow(styles.boxShadow);
  const filter = shadow ? buildDropShadowFilter(shadow) : null;

  if (filter) {
    parts.push(filter.markup);
  }

  if (!isTransparentColor(styles.backgroundColor)) {
    parts.push(`
      <rect
        x="0"
        y="0"
        width="${roundSvgValue(legendRect.width)}"
        height="${roundSvgValue(legendRect.height)}"
        fill="${escapeXml(styles.backgroundColor)}"
        ${filter ? `filter="url(#${filter.id})"` : ''}
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
        buildNativeTextLayer(
          legendItem,
          {
            x: 0,
            y: 0,
            width: legendRect.width,
            height: legendRect.height
          },
          'khartis-legend-text',
          legendContainer
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

export function buildGeoIndicationsLayer(pageContainer: HTMLElement): string {
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

export function buildAnnotationLayer(pageContainer: HTMLElement): string {
  const annotationItems = pageContainer.querySelectorAll<HTMLElement>(
    '.annotation-overlay .annotation-item'
  );

  if (annotationItems.length === 0) {
    return '';
  }

  const parts: string[] = [];

  annotationItems.forEach((item, index) => {
    if (item.dataset.khartisExportPlaceholder === 'true') {
      return;
    }

    const role = item.dataset.annotationRole || item.dataset.annotationType;
    const id = `khartis-annotation-${role ?? 'item'}-${index + 1}`;
    const textElement = item.querySelector('.annotation-text');
    if (textElement instanceof HTMLElement) {
      parts.push(
        buildNativeTextLayer(
          textElement,
          getRelativeRect(item, pageContainer),
          id,
          pageContainer
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

function resolveElementBackgroundColor(
  element: HTMLElement,
  fallback: string
): string {
  const backgroundColor = getComputedStyle(element).backgroundColor;

  return isTransparentColor(backgroundColor) ? fallback : backgroundColor;
}

export function buildPageLayer(
  pageContainer: HTMLElement,
  geometry: PageExportGeometry
): string {
  const pageBackgroundColor = resolveElementBackgroundColor(
    pageContainer,
    DEFAULT_PAGE_BACKGROUND_COLOR
  );
  const parts = [
    `
      <rect
        id="khartis-page-background"
        x="0"
        y="0"
        width="${roundSvgValue(geometry.width)}"
        height="${roundSvgValue(geometry.height)}"
        fill="${escapeXml(pageBackgroundColor)}"
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
        fill="${escapeXml(mapBackgroundColor)}"
      />
    `);
  }

  return `
    <g id="khartis-layer-page">
      ${parts.join('')}
    </g>
  `;
}
