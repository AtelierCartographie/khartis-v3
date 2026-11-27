import { getTextRotationOriginX } from '../utils/annotation-style.utils';
import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import * as m from '$lib/paraglide/messages';
import { SVG_MAP_FRAME_CLIP_ID } from './constants';
import {
  buildCanvasVisualizationFallback,
  buildDeckVisualizationLayer,
  buildMapLibreBackgroundLayer
} from './deck-layer';
import { injectRootAttribute, serializeSvgNode } from './dom-to-svg';
import {
  type ParsedBoxShadow,
  cssPaintAttributes,
  escapeXml,
  isTransparentColor,
  opacityAttribute,
  parseBoxShadow
} from './svg-color';
import {
  type SvgIdDeduper,
  createSvgIdDeduper,
  getRelativeRect,
  parseCssPixels,
  resolvePageExportGeometry,
  roundSvgValue,
  sanitizeLocalizedSvgId
} from './svg-values';
import type {
  PageExportGeometry,
  RelativeRect,
  StructuredSvgOptions
} from './types';
import { resolveMapCanvas } from './webgl-prerender';

let dropShadowFilterCounter = 0;

export function resetDropShadowFilterIds(): void {
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
      <feGaussianBlur in="SourceAlpha" stdDeviation="${roundSvgValue(shadow.blur / 2)}" />
      <feOffset
        dx="${roundSvgValue(shadow.offsetX)}"
        dy="${roundSvgValue(shadow.offsetY)}"
        result="khartis-shadow-offset"
      />
      <feFlood
        flood-color="${escapeXml(shadow.color)}"
        flood-opacity="${roundSvgValue(shadow.opacity)}"
      />
      <feComposite in2="khartis-shadow-offset" operator="in" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
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
  const strokeAttributes = hasBorder
    ? `${cssPaintAttributes('stroke', styles.borderColor)} stroke-width="${roundSvgValue(borderWidth)}"`
    : '';
  const shadow = parseBoxShadow(styles.boxShadow);
  const filter = shadow ? buildDropShadowFilter(shadow) : null;

  return `
    ${filter ? filter.markup : ''}
    <rect
      x="0"
      y="0"
      width="${roundSvgValue(width)}"
      height="${roundSvgValue(height)}"
      ${radius > 0 ? `rx="${roundSvgValue(radius)}" ry="${roundSvgValue(radius)}"` : ''}
      ${cssPaintAttributes('fill', backgroundColor)}
      ${strokeAttributes}
      ${opacityAttribute(styles.opacity)}
      ${filter ? `filter="url(#${filter.id})"` : ''}
    />
  `;
}

function resolveLineHeight(computed: CSSStyleDeclaration): number {
  const lineHeight = parseCssPixels(computed.lineHeight);
  if (lineHeight > 0) return lineHeight;

  const fontSize = parseCssPixels(computed.fontSize);
  return fontSize > 0 ? fontSize * 1.2 : 12;
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
  left: number;
  right: number;
  top: number;
  height: number;
}

function collectTextNodes(element: HTMLElement): Text[] {
  const showText = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
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
  top: number
): NativeTextLine | null {
  return lines.find((line) => Math.abs(line.top - top) < 1.5) ?? null;
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

      const left = charRect.left - containerRect.left;
      const right = charRect.right - containerRect.left;
      const top = charRect.top - containerRect.top;
      const existingLine = findNativeTextLine(lines, top);
      const line =
        existingLine ??
        ({
          text: '',
          left,
          right,
          top,
          height: charRect.height
        } satisfies NativeTextLine);

      if (!existingLine) {
        lines.push(line);
      }

      line.text += character;
      line.left = Math.min(line.left, left);
      if (character.trim()) {
        line.right = Math.max(line.right, right);
      }
      line.height = Math.max(line.height, charRect.height);
      lastLine = line;
    }
  }

  return lines
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
}

function buildFallbackNativeTextLines(
  text: string,
  rect: RelativeRect,
  computed: CSSStyleDeclaration
): NativeTextLine[] {
  const lineHeight = resolveLineHeight(computed);
  const fontSize = parseCssPixels(computed.fontSize) || lineHeight / 1.2;
  const contentHeight = fontSize * 1.2;
  const topPadding = parseCssPixels(computed.paddingTop);
  const x = resolveAlignedTextX(rect, computed);

  return text.split('\n').map((line, index) => ({
    text: line.trim(),
    left: x,
    right: x,
    top:
      rect.y +
      topPadding +
      lineHeight * index +
      (lineHeight - contentHeight) / 2,
    height: contentHeight
  }));
}

const DEFAULT_FONT_ASCENT_RATIO = 0.8;
let fontMetricsContext: OffscreenCanvasRenderingContext2D | null = null;

// A text range's box spans the font's ascent plus descent: the baseline
// sits at the ascent share of that box, whatever the line-height.
function resolveFontAscentRatio(computed: CSSStyleDeclaration): number {
  if (typeof OffscreenCanvas === 'undefined') return DEFAULT_FONT_ASCENT_RATIO;

  fontMetricsContext ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (typeof fontMetricsContext?.measureText !== 'function') {
    return DEFAULT_FONT_ASCENT_RATIO;
  }

  fontMetricsContext.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  const metrics = fontMetricsContext.measureText('Hg');
  const ascent = Number(metrics?.fontBoundingBoxAscent);
  const descent = Number(metrics?.fontBoundingBoxDescent);
  const total = ascent + descent;

  return Number.isFinite(total) && total > 0
    ? ascent / total
    : DEFAULT_FONT_ASCENT_RATIO;
}

function resolveNativeLineAnchor(
  line: NativeTextLine,
  textAnchor: string
): number {
  if (textAnchor === 'middle') return (line.left + line.right) / 2;
  if (textAnchor === 'end') return line.right;
  return line.left;
}

// Lines are anchored on the side the layout aligns them to and written on
// their alphabetic baseline: a design tool that substitutes the font, or
// ignores `dominant-baseline`, keeps each line in place.
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
  // Layout items can be scaled with the page (CSS transform): computed font
  // sizes ignore it, while the measured line boxes include it.
  const layoutScale =
    element.offsetWidth > 0
      ? element.getBoundingClientRect().width / element.offsetWidth
      : 1;
  const fontSize = parseCssPixels(computed.fontSize) * layoutScale;
  const textAnchor = resolveTextAnchor(computed.textAlign);
  const ascentRatio = resolveFontAscentRatio(computed);
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
  const textAttributes = [
    cssPaintAttributes('fill', computed.color),
    opacityAttribute(computed.opacity),
    `font-family="${escapeXml(computed.fontFamily)}"`,
    `font-size="${roundSvgValue(fontSize)}"`,
    computed.fontStyle && computed.fontStyle !== 'normal'
      ? `font-style="${escapeXml(computed.fontStyle)}"`
      : '',
    computed.fontWeight &&
    computed.fontWeight !== 'normal' &&
    computed.fontWeight !== '400'
      ? `font-weight="${escapeXml(computed.fontWeight)}"`
      : '',
    textAnchor !== 'start' ? `text-anchor="${textAnchor}"` : '',
    computed.letterSpacing && computed.letterSpacing !== 'normal'
      ? `letter-spacing="${roundSvgValue(parseCssPixels(computed.letterSpacing) * layoutScale)}"`
      : '',
    computed.textDecorationLine && computed.textDecorationLine !== 'none'
      ? `text-decoration="${escapeXml(computed.textDecorationLine)}"`
      : ''
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <g id="${escapeXml(id)}" transform="${transform}">
      ${background}
      ${lines
        .map(
          (line) =>
            `<text x="${roundSvgValue(resolveNativeLineAnchor(line, textAnchor) - rect.x)}" y="${roundSvgValue(line.top + line.height * ascentRatio - rect.y)}" ${textAttributes} xml:space="preserve">${escapeXml(line.text)}</text>`
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
        ${opacityAttribute(computed.opacity)}
        preserveAspectRatio="none"
      />
    </g>
  `;
}

export function buildTopLevelLayer(
  nameLabel: string,
  content: string,
  dedupeId: SvgIdDeduper,
  extraAttributes: string = ''
): string {
  if (!content.trim()) return '';

  const groupId = dedupeId(sanitizeLocalizedSvgId(nameLabel));

  return `
    <g
      id="${escapeXml(groupId)}"
      inkscape:groupmode="layer"
      inkscape:label="${escapeXml(nameLabel)}"
      data-name="${escapeXml(nameLabel)}"
      ${extraAttributes}
    >
      ${content}
    </g>
  `;
}

function buildLegendLayer(
  legendContainer: HTMLElement,
  pageContainer: HTMLElement,
  dedupeId: SvgIdDeduper,
  nextSegmentIndex: () => number
): string {
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
        ${cssPaintAttributes('fill', styles.backgroundColor)}
        ${filter ? `filter="url(#${filter.id})"` : ''}
      />
    `);
  }

  const legendSvgs = legendContainer.querySelectorAll<SVGSVGElement>('svg');
  legendSvgs.forEach((svg) => {
    const svgRect = getRelativeRect(svg, legendContainer);
    parts.push(
      injectRootAttribute(
        serializeSvgNode(svg, {
          x: svgRect.x,
          y: svgRect.y,
          width: svgRect.width,
          height: svgRect.height
        }),
        `id="khartis-legend-segment-${nextSegmentIndex()}"`
      )
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

  return buildTopLevelLayer(
    m.svg_export_layer_legend(),
    parts.join(''),
    dedupeId,
    `transform="translate(${roundSvgValue(legendRect.x)}, ${roundSvgValue(legendRect.y)})"`
  );
}

export function buildLegendLayers(
  pageContainer: HTMLElement,
  dedupeId: SvgIdDeduper
): string {
  const legendContainers =
    pageContainer.querySelectorAll<HTMLElement>('.legend-container');
  let segmentIndex = 0;
  const nextSegmentIndex = (): number => ++segmentIndex;

  return Array.from(legendContainers)
    .map((legendContainer) =>
      buildLegendLayer(
        legendContainer,
        pageContainer,
        dedupeId,
        nextSegmentIndex
      )
    )
    .join('');
}
interface GeoIndicationKind {
  selector: string;
  nameLabel: () => string;
}
const GEO_INDICATION_KINDS: GeoIndicationKind[] = [
  { selector: '.scale-bar', nameLabel: m.svg_export_layer_scale },
  { selector: '.north-arrow', nameLabel: m.svg_export_layer_orientation },
  { selector: '.inset-map-panel', nameLabel: m.svg_export_layer_inset_map }
];

function buildGeoIndicationItem(
  item: HTMLElement,
  pageContainer: HTMLElement,
  itemDedupeId: SvgIdDeduper
): string {
  const itemRect = getRelativeRect(item, pageContainer);
  if (itemRect.width <= 0 || itemRect.height <= 0) {
    return '';
  }

  const itemParts = [
    buildElementBackgroundRect(item, itemRect.width, itemRect.height)
  ];

  const svgs = item.querySelectorAll<SVGSVGElement>('svg');
  svgs.forEach((svg, svgIndex) => {
    const svgRect = getRelativeRect(svg, item);
    itemParts.push(
      injectRootAttribute(
        serializeSvgNode(svg, {
          x: svgRect.x,
          y: svgRect.y,
          width: svgRect.width,
          height: svgRect.height
        }),
        `id="${itemDedupeId(`segment-${svgIndex + 1}`)}"`
      )
    );
  });

  const itemMarkup = itemParts.filter(Boolean).join('');
  if (!itemMarkup) {
    return '';
  }

  return `
    <g transform="translate(${roundSvgValue(itemRect.x)}, ${roundSvgValue(itemRect.y)})">
      ${itemMarkup}
    </g>
  `;
}

function buildGeoIndicationKindLayer(
  pageContainer: HTMLElement,
  kind: GeoIndicationKind,
  dedupeId: SvgIdDeduper
): string {
  const items = pageContainer.querySelectorAll<HTMLElement>(
    `.geo-indications-overlay ${kind.selector}`
  );
  if (items.length === 0) {
    return '';
  }

  const itemDedupeId = createSvgIdDeduper();
  const content = Array.from(items)
    .map((item) => buildGeoIndicationItem(item, pageContainer, itemDedupeId))
    .filter(Boolean)
    .join('');

  return buildTopLevelLayer(kind.nameLabel(), content, dedupeId);
}

export function buildGeoIndicationsLayers(
  pageContainer: HTMLElement,
  dedupeId: SvgIdDeduper
): string[] {
  return GEO_INDICATION_KINDS.map((kind) =>
    buildGeoIndicationKindLayer(pageContainer, kind, dedupeId)
  );
}
const ANNOTATION_ROLE_LABELS: Record<string, () => string> = {
  [ANNOTATION_ROLE.TITLE]: m.svg_export_role_title,
  [ANNOTATION_ROLE.SUBTITLE]: m.svg_export_role_subtitle,
  [ANNOTATION_ROLE.SOURCE]: m.svg_export_role_source,
  [ANNOTATION_ROLE.BASEMAP_SOURCE]: m.svg_export_role_basemap_source,
  [ANNOTATION_ROLE.SIGNATURE]: m.svg_export_role_signature,
  [ANNOTATION_ROLE.CREDIT]: m.svg_export_role_credit,
  [ANNOTATION_ROLE.NOTE]: m.svg_export_role_note
};

function resolveAnnotationRoleLabel(item: HTMLElement): string {
  const role = item.dataset.annotationRole;
  return (
    (role && ANNOTATION_ROLE_LABELS[role]?.()) ?? m.svg_export_role_annotation()
  );
}

function buildAnnotationItem(
  item: HTMLElement,
  pageContainer: HTMLElement,
  dedupeId: SvgIdDeduper
): string {
  const nameLabel = resolveAnnotationRoleLabel(item);
  const id = dedupeId(sanitizeLocalizedSvgId(nameLabel));
  const nameAttribute = `data-name="${escapeXml(nameLabel)}"`;

  const textElement = item.querySelector('.annotation-text');
  if (textElement instanceof HTMLElement) {
    // A rotated text is measured upright, then turned about the point its
    // alignment anchors, which the rotation leaves in place.
    const textBox = item.querySelector<HTMLElement>('.annotation-text-box');
    const rotation = Number(textBox?.dataset.rotation ?? 0);
    const previousTransform = textBox?.style.transform ?? '';
    if (rotation && textBox) textBox.style.transform = 'none';
    const rect = getRelativeRect(item, pageContainer);
    const layer = buildNativeTextLayer(textElement, rect, id, pageContainer);
    if (rotation && textBox) textBox.style.transform = previousTransform;
    const turned =
      rotation && layer
        ? `<g transform="rotate(${roundSvgValue(rotation)} ${roundSvgValue(rect.x + rect.width * getTextRotationOriginX(item.dataset.textAlign))} ${roundSvgValue(rect.y + rect.height / 2)})">${layer}</g>`
        : layer;
    return injectRootAttribute(turned, nameAttribute);
  }

  // A turned shape, drawing or image is measured upright, then turned about
  // its centre, as on screen.
  const turnable = item.querySelector<HTMLElement | SVGElement>(
    '.annotation-turnable[data-rotation]'
  );
  const rotation = Number(turnable?.dataset.rotation ?? 0);
  const previousTransform = turnable?.style.transform ?? '';
  if (rotation && turnable) turnable.style.transform = 'none';
  const turnedRect =
    rotation && turnable ? getRelativeRect(turnable, pageContainer) : null;
  const layer = buildUprightAnnotationContent(
    item,
    pageContainer,
    id,
    nameAttribute
  );
  if (rotation && turnable) turnable.style.transform = previousTransform;

  return turnedRect && layer
    ? `<g transform="rotate(${roundSvgValue(rotation)} ${roundSvgValue(turnedRect.x + turnedRect.width / 2)} ${roundSvgValue(turnedRect.y + turnedRect.height / 2)})">${layer}</g>`
    : layer;
}

function buildUprightAnnotationContent(
  item: HTMLElement,
  pageContainer: HTMLElement,
  id: string,
  nameAttribute: string
): string {
  const svgElement = item.querySelector('svg');
  if (svgElement instanceof SVGElement) {
    const svgRect = getRelativeRect(svgElement, pageContainer);
    return `
      <g id="${escapeXml(id)}" ${nameAttribute}>
        ${serializeSvgNode(svgElement, {
          x: svgRect.x,
          y: svgRect.y,
          width: svgRect.width,
          height: svgRect.height
        })}
      </g>
    `;
  }

  const imageElement = item.querySelector('img');
  if (imageElement instanceof HTMLImageElement) {
    return injectRootAttribute(
      buildImageLayer(
        imageElement,
        getRelativeRect(imageElement, pageContainer),
        id
      ),
      nameAttribute
    );
  }

  return '';
}

export function buildAnnotationLayer(
  pageContainer: HTMLElement,
  dedupeId: SvgIdDeduper
): string {
  const annotationItems = pageContainer.querySelectorAll<HTMLElement>(
    '.annotation-overlay .annotation-item'
  );

  if (annotationItems.length === 0) {
    return '';
  }

  const itemDedupeId = createSvgIdDeduper();
  const content = Array.from(annotationItems)
    .filter((item) => item.dataset.khartisExportPlaceholder !== 'true')
    .map((item) => buildAnnotationItem(item, pageContainer, itemDedupeId))
    .filter(Boolean)
    .join('');

  return buildTopLevelLayer(
    m.svg_export_layer_annotations(),
    `
      <g id="khartis-layer-annotations">
        ${content}
      </g>
    `,
    dedupeId
  );
}
export function buildVisualizationLayer(
  pageContainer: HTMLElement,
  dedupeId: SvgIdDeduper,
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

  return buildTopLevelLayer(
    m.svg_export_layer_map(),
    parts.join(''),
    dedupeId,
    geometry.mapFrame ? `clip-path="url(#${SVG_MAP_FRAME_CLIP_ID})"` : ''
  );
}
