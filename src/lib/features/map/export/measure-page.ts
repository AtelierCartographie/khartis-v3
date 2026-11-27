import { EXPORT_MAP_STAGE_SELECTOR, EXPORT_PAGE_SELECTOR } from './constants';
import { resolveMapPlacement, withPreparedMapExport } from './page-assembly';
import { getRelativeRect, parseCssPixels } from './svg-values';
import type { MapExportPlacement } from './types';

/** A box on the page, in page units from its top-left corner. */
export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface MeasuredPageText {
  /** Title, source…, or null for a free annotation. */
  role: string | null;
  box: PageBox;
  text: string;
  fontFamily: string;
  /** In page units. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  /** CSS colours, as the browser computes them. */
  color: string;
  background: string | null;
  align: 'left' | 'center' | 'right';
}
/** The font of a page element, as the browser computes it. */
export interface MeasuredFont {
  family: string;
  /** In page units. */
  size: number;
  color: string;
}
export interface MeasuredPageLegend {
  /** The legend item id (`legend-viz-<id>--<primitive>…`). */
  itemId: string;
  box: PageBox;
  font: MeasuredFont | null;
  titleFont: MeasuredFont | null;
  /**
   * Proportional sizes in legend order, in page units: the height of a
   * symbol (circle, square, bar, spike) or the width of a line.
   */
  sizes: Array<{ label: string; size: number }>;
  /** Title, subtitle and note as drawn, their lines joined by `\n`. */
  title: string | null;
  subtitle: string | null;
  note: string | null;
}
/** Where every element of the page sits, as exported. */
export interface MeasuredMapPage {
  width: number;
  height: number;
  map: PageBox | null;
  /** For `buildMapGeoreference`, in page units. */
  placement: MapExportPlacement | null;
  facets: Array<{
    box: PageBox;
    title: string;
    titleText: MeasuredPageText | null;
  }>;
  texts: MeasuredPageText[];
  /** Shapes, drawings and images, which are not measured. */
  otherAnnotations: number;
  legends: MeasuredPageLegend[];
  scaleBar: PageBox | null;
  scaleBarFont: MeasuredFont | null;
  northArrow: PageBox | null;
}

// SVG text keeps its own units inside a scaled frame: page units.
function measureFont(text: Element | null): MeasuredFont | null {
  if (!text) {
    return null;
  }
  const style = getComputedStyle(text);
  return {
    family: firstFontFamily(style.fontFamily),
    size: parseCssPixels(style.fontSize),
    color: style.fill && style.fill !== 'none' ? style.fill : style.color
  };
}

function firstFontFamily(css: string): string {
  return (css.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

function cssAlign(value: string): MeasuredPageText['align'] {
  return value === 'center' || value === 'right' || value === 'end'
    ? value === 'end'
      ? 'right'
      : value
    : 'left';
}

function isTransparentCss(color: string): boolean {
  return (
    color === 'transparent' ||
    /rgba\([^)]*,\s*0(\.0+)?\s*\)$/.test(color.replace(/\s+/g, ' '))
  );
}

/**
 * Measures the page as it is exported (placeholders and grid hidden): the
 * map frame, the texts with their computed style, the legend frames and the
 * geographic indications. `pageWidth` is the page width in page units.
 */
export async function measureMapPage(
  pageWidth: number
): Promise<MeasuredMapPage | null> {
  const pageContainer = document.querySelector(
    EXPORT_PAGE_SELECTOR
  ) as HTMLElement | null;
  if (!pageContainer) {
    return null;
  }

  return withPreparedMapExport(pageContainer, async () => {
    const pageRect = pageContainer.getBoundingClientRect();
    if (pageRect.width <= 0) {
      return null;
    }
    const unit = pageWidth / pageRect.width;
    const box = (element: Element): PageBox | null => {
      const rect = getRelativeRect(element, pageContainer);
      return rect.width > 0 && rect.height > 0
        ? {
            x: rect.x * unit,
            y: rect.y * unit,
            width: rect.width * unit,
            height: rect.height * unit
          }
        : null;
    };
    const find = (selector: string) => pageContainer.querySelector(selector);

    const mapStage = find(EXPORT_MAP_STAGE_SELECTOR);
    const texts: MeasuredPageText[] = [];
    let otherAnnotations = 0;
    pageContainer
      .querySelectorAll<HTMLElement>('.annotation-overlay .annotation-item')
      .forEach((item) => {
        if (item.dataset.khartisExportPlaceholder === 'true') {
          return;
        }
        const textElement = item.querySelector<HTMLElement>('.annotation-text');
        const itemBox = box(item);
        if (!textElement || !itemBox) {
          otherAnnotations += itemBox ? 1 : 0;
          return;
        }
        const text = textElement.innerText.trim();
        if (!text) {
          return;
        }
        const style = getComputedStyle(textElement);
        const background = getComputedStyle(item).backgroundColor;
        texts.push({
          role: item.dataset.annotationRole ?? null,
          box: box(textElement) ?? itemBox,
          text,
          fontFamily: firstFontFamily(style.fontFamily),
          // The item is scaled as a whole: its own font size is in page units.
          fontSize: parseCssPixels(style.fontSize),
          bold: Number(style.fontWeight) >= 600 || style.fontWeight === 'bold',
          italic: style.fontStyle === 'italic',
          color: style.color,
          background:
            background && !isTransparentCss(background) ? background : null,
          align: cssAlign(style.textAlign)
        });
      });

    const legends: MeasuredPageLegend[] = [];
    pageContainer
      .querySelectorAll<HTMLElement>('.legend-overlay .legend-container')
      .forEach((frame) => {
        const frameBox = box(frame);
        const itemId = frame.dataset.legendItemId;
        if (!frameBox || !itemId) {
          return;
        }
        const symbols = frame.querySelector(
          '.legend-svg--symbols .symbol_legend'
        );
        const lines = frame.querySelector('.khartis_proportional_line_legend');
        const sizes = symbols
          ? Array.from(
              symbols.querySelectorAll<SVGGraphicsElement>('.symbols > *')
            ).map((symbol) => symbol.getBBox().height)
          : lines
            ? Array.from(lines.querySelectorAll('.segments line')).map((line) =>
                Number(line.getAttribute('stroke-width'))
              )
            : [];
        const labels = Array.from(
          (symbols ?? lines)?.querySelectorAll(':scope > .labels text') ?? []
        ).map((label) => label.textContent?.trim() ?? '');
        const textLines = (group: Element | null | undefined) =>
          Array.from(group?.querySelectorAll('text') ?? [])
            .map((line) => line.textContent?.trim() ?? '')
            .join('\n') || null;
        legends.push({
          itemId,
          box: frameBox,
          title: textLines(frame.querySelector('g.title')),
          // The subtitle of the sizes, when the frame shows some.
          subtitle: textLines(
            (symbols ?? lines)?.querySelector(':scope > g.subtitle')
          ),
          note: textLines(frame.querySelector('g.note')),
          font: measureFont(
            frame.querySelector('.labels text') ??
              frame.querySelector('svg g:not(.title) > text')
          ),
          titleFont: measureFont(frame.querySelector('.title text')),
          sizes:
            sizes.length === labels.length
              ? sizes
                  .map((size, index) => ({ label: labels[index], size }))
                  .filter((entry) => Number.isFinite(entry.size))
              : []
        });
      });

    const facets = Array.from(
      pageContainer.querySelectorAll<HTMLElement>('.facet-cell')
    ).flatMap((cell) => {
      const frame = cell.querySelector('.facet-map-frame');
      const frameBox = frame ? box(frame) : null;
      const title = cell.querySelector<HTMLElement>('.facet-title');
      const titleBox = title ? box(title) : null;
      const style = title ? getComputedStyle(title) : null;
      return frameBox
        ? [
            {
              box: frameBox,
              title: title?.innerText.trim() ?? '',
              titleText:
                title && titleBox && style
                  ? {
                      role: null,
                      box: titleBox,
                      text: title.innerText.trim(),
                      fontFamily: firstFontFamily(style.fontFamily),
                      // The cell is not scaled: back to page units.
                      fontSize: parseCssPixels(style.fontSize) * unit,
                      bold:
                        Number(style.fontWeight) >= 600 ||
                        style.fontWeight === 'bold',
                      italic: style.fontStyle === 'italic',
                      color: style.color,
                      background: null,
                      align: cssAlign(style.textAlign)
                    }
                  : null
            }
          ]
        : [];
    });

    const scaleBar = find('.geo-indications-overlay .scale-bar');
    const northArrow = find('.geo-indications-overlay .north-arrow');
    return {
      width: pageWidth,
      height: pageRect.height * unit,
      map: mapStage ? box(mapStage) : null,
      placement: resolveMapPlacement(pageContainer, unit, [0, 0], 'on-screen'),
      facets,
      texts,
      otherAnnotations,
      legends,
      scaleBar: scaleBar ? box(scaleBar) : null,
      scaleBarFont: measureFont(scaleBar?.querySelector('text') ?? null),
      northArrow: northArrow ? box(northArrow) : null
    };
  });
}
