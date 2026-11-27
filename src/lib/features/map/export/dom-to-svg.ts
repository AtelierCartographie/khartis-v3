import { cssPaintAttributeEntries } from './svg-color';
import { roundSvgValue } from './svg-values';
import type { RelativeRect } from './types';

const SVG_PRESENTATION_ATTRIBUTES = [
  'color',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'vector-effect',
  'opacity'
] as const;
const SVG_PAINTED_TAGS = new Set([
  'rect',
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'text',
  'tspan',
  'use'
]);
const SVG_TEXT_TAGS = new Set(['text', 'tspan']);

function readSvgStyle(
  element: SVGElement,
  computed: CSSStyleDeclaration,
  property: string
): string {
  return (
    computed.getPropertyValue(property).trim() ||
    element.getAttribute(property)?.trim() ||
    ''
  );
}

function stripCssPixels(value: string): string {
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => {
      const parsed = Number.parseFloat(token);
      return Number.isFinite(parsed) ? roundSvgValue(parsed) : token;
    })
    .join(' ');
}

function isOpaqueOpacity(value: string): boolean {
  const opacity = Number.parseFloat(value);
  return !Number.isFinite(opacity) || opacity >= 1;
}

const NEUTRAL_DOMINANT_BASELINES = new Set(['', 'auto', 'alphabetic']);

// Illustrator, Affinity and Canva ignore `dominant-baseline`: the text is
// moved by the offset the browser measures between the authored baseline
// and the alphabetic one, then written on that alphabetic baseline.
function measureAlphabeticBaselineShift(text: SVGGraphicsElement): number {
  if (typeof text.getBBox !== 'function') return 0;

  const nodes = [
    text,
    ...Array.from(text.querySelectorAll<SVGElement>('tspan'))
  ];
  const needsShift = nodes.some(
    (node) =>
      !NEUTRAL_DOMINANT_BASELINES.has(
        readSvgStyle(node, getComputedStyle(node), 'dominant-baseline')
      )
  );
  if (!needsShift) return 0;

  const previousValues = nodes.map((node) =>
    node.style.getPropertyValue('dominant-baseline')
  );
  try {
    const authored = text.getBBox();
    nodes.forEach((node) =>
      node.style.setProperty('dominant-baseline', 'alphabetic')
    );
    const alphabetic = text.getBBox();
    if (authored.height <= 0 || alphabetic.height <= 0) return 0;
    return authored.y - alphabetic.y;
  } catch {
    return 0;
  } finally {
    nodes.forEach((node, index) => {
      const previous = previousValues[index];
      if (previous) {
        node.style.setProperty('dominant-baseline', previous);
      } else {
        node.style.removeProperty('dominant-baseline');
      }
    });
  }
}

function shiftSvgYAttribute(element: Element, delta: number): boolean {
  const value = element.getAttribute('y');
  if (value === null) return true;

  const values = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.some((entry) => !Number.isFinite(entry))) return false;

  element.setAttribute(
    'y',
    values.map((entry) => roundSvgValue(entry + delta)).join(' ')
  );
  return true;
}

function applyAlphabeticBaselineShift(clone: SVGElement, delta: number): void {
  if (Math.abs(delta) < 0.01) return;

  const positioned = [clone, ...Array.from(clone.querySelectorAll('tspan'))];
  const allNumeric = positioned.every((element) =>
    /^[\s\d.,eE+-]*$/.test(element.getAttribute('y') ?? '')
  );

  if (allNumeric) {
    if (clone.getAttribute('y') === null) {
      clone.setAttribute('y', roundSvgValue(delta));
    }
    positioned.forEach((element) => shiftSvgYAttribute(element, delta));
    return;
  }

  const transform = clone.getAttribute('transform');
  clone.setAttribute(
    'transform',
    `${transform ? `${transform} ` : ''}translate(0, ${roundSvgValue(delta)})`
  );
}

function setSvgAttributes(
  element: SVGElement,
  entries: [string, string][]
): void {
  entries.forEach(([name, value]) => element.setAttribute(name, value));
}

// Illustrator and Figma neither apply the CSS of a `style` attribute
// reliably nor inherit paint from a group: every painted element carries
// its resolved style as presentation attributes, groups only their opacity.
function applySvgPresentation(source: SVGElement, clone: SVGElement): void {
  const computed = getComputedStyle(source);
  const tagName = source.localName;
  const read = (property: string): string =>
    readSvgStyle(source, computed, property);
  const hasComputedPaint = computed.getPropertyValue('fill').trim() !== '';
  const isPainted = SVG_PAINTED_TAGS.has(tagName);
  const isText = SVG_TEXT_TAGS.has(tagName);

  const entries: [string, string][] = [];
  const opacity = read('opacity');
  if (!isOpaqueOpacity(opacity)) {
    entries.push(['opacity', roundSvgValue(Number.parseFloat(opacity))]);
  }

  if (isPainted) {
    const fill = read('fill');
    if (fill) {
      entries.push(
        ...cssPaintAttributeEntries(
          'fill',
          fill,
          Number.parseFloat(read('fill-opacity') || '1')
        )
      );
    }

    const stroke = read('stroke');
    if (stroke) {
      const strokeEntries = cssPaintAttributeEntries(
        'stroke',
        stroke,
        Number.parseFloat(read('stroke-opacity') || '1')
      );
      entries.push(...strokeEntries);

      if (strokeEntries[0]?.[1] !== 'none') {
        const strokeWidth = read('stroke-width');
        if (strokeWidth) {
          entries.push(['stroke-width', stripCssPixels(strokeWidth)]);
        }
        const dashArray = read('stroke-dasharray');
        if (dashArray && dashArray !== 'none') {
          entries.push(['stroke-dasharray', stripCssPixels(dashArray)]);
        }
        const lineCap = read('stroke-linecap');
        if (lineCap && lineCap !== 'butt') {
          entries.push(['stroke-linecap', lineCap]);
        }
        const lineJoin = read('stroke-linejoin');
        if (lineJoin && lineJoin !== 'miter') {
          entries.push(['stroke-linejoin', lineJoin]);
        }
      }
    }

    const vectorEffect = read('vector-effect');
    if (vectorEffect === 'non-scaling-stroke') {
      entries.push(['vector-effect', vectorEffect]);
    }
  }

  if (isText) {
    const fontFamily = read('font-family');
    if (fontFamily) entries.push(['font-family', fontFamily]);
    const fontSize = read('font-size');
    if (fontSize) entries.push(['font-size', stripCssPixels(fontSize)]);
    const fontStyle = read('font-style');
    if (fontStyle && fontStyle !== 'normal') {
      entries.push(['font-style', fontStyle]);
    }
    const fontWeight = read('font-weight');
    if (fontWeight && fontWeight !== 'normal' && fontWeight !== '400') {
      entries.push(['font-weight', fontWeight]);
    }
    if (read('font-variant') === 'small-caps') {
      entries.push(['font-variant', 'small-caps']);
    }
    const letterSpacing = read('letter-spacing');
    if (letterSpacing && letterSpacing !== 'normal') {
      const spacing = stripCssPixels(letterSpacing);
      if (spacing !== '0') entries.push(['letter-spacing', spacing]);
    }
    const textAnchor = read('text-anchor');
    if (textAnchor && textAnchor !== 'start') {
      entries.push(['text-anchor', textAnchor]);
    }
  }

  const baselineShift =
    tagName === 'text' && source instanceof SVGGraphicsElement
      ? measureAlphabeticBaselineShift(source)
      : 0;

  if (isPainted || hasComputedPaint) {
    clone.removeAttribute('style');
    SVG_PRESENTATION_ATTRIBUTES.forEach((attribute) =>
      clone.removeAttribute(attribute)
    );
    setSvgAttributes(clone, entries);
    if (tagName === 'text' && hasComputedPaint) {
      clone
        .querySelectorAll('tspan')
        .forEach((tspan) =>
          ['dominant-baseline', 'alignment-baseline'].forEach((attribute) =>
            tspan.removeAttribute(attribute)
          )
        );
    }
  }
  applyAlphabeticBaselineShift(clone, baselineShift);

  const sourceChildren = Array.from(source.children).filter(
    (child): child is SVGElement => child instanceof SVGElement
  );
  const cloneChildren = Array.from(clone.children).filter(
    (child): child is SVGElement => child instanceof SVGElement
  );

  sourceChildren.forEach((sourceChild, index) => {
    const cloneChild = cloneChildren[index];
    if (!cloneChild) return;

    const childComputed = getComputedStyle(sourceChild);
    if (
      childComputed.display === 'none' ||
      childComputed.visibility === 'hidden'
    ) {
      cloneChild.remove();
      return;
    }
    applySvgPresentation(sourceChild, cloneChild);
  });
}

function parseSvgViewBox(
  value: string | null
): { width: number; height: number } | null {
  if (!value) return null;

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return { width: parts[2], height: parts[3] };
}

const SCALE_EPSILON = 0.001;

function convertNestedSvgToGroup(
  clone: SVGElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const viewBox = parseSvgViewBox(clone.getAttribute('viewBox'));
  const scaleX = viewBox && viewBox.width > 0 ? width / viewBox.width : 1;
  const scaleY = viewBox && viewBox.height > 0 ? height / viewBox.height : 1;
  const needsScale =
    Math.abs(scaleX - 1) > SCALE_EPSILON ||
    Math.abs(scaleY - 1) > SCALE_EPSILON;
  const transform = needsScale
    ? `translate(${roundSvgValue(x)}, ${roundSvgValue(y)}) scale(${roundSvgValue(scaleX)}, ${roundSvgValue(scaleY)})`
    : `translate(${roundSvgValue(x)}, ${roundSvgValue(y)})`;

  clone.removeAttribute('x');
  clone.removeAttribute('y');
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  clone.removeAttribute('viewBox');
  clone.setAttribute('transform', transform);
}

export function serializeSvgNode(
  element: SVGElement,
  position?: Partial<RelativeRect>
): string {
  const clone = element.cloneNode(true) as SVGElement;
  applySvgPresentation(element, clone);

  const x = position?.x ?? 0;
  const y = position?.y ?? 0;
  const width = position?.width ?? 0;
  const height = position?.height ?? 0;

  if (clone.tagName.toLowerCase() === 'svg') {
    convertNestedSvgToGroup(clone, x, y, width, height);

    const outer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    Array.from(clone.attributes).forEach((attribute) => {
      outer.setAttribute(attribute.name, attribute.value);
    });
    Array.from(clone.childNodes).forEach((child) => {
      outer.appendChild(child);
    });

    return new XMLSerializer().serializeToString(outer);
  }

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
export function injectRootAttribute(markup: string, attribute: string): string {
  return markup.replace(/^(\s*)<(svg|g)/, `$1<$2 ${attribute}`);
}
