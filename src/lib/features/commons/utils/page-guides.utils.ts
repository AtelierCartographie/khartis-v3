/**
 * Magnetic alignment of a page element: while it is dragged, its edges and
 * its centre are pulled onto the page centre lines and the page margins when
 * they come close, and the lines it snapped to are returned to be drawn.
 * Everything is in page coordinates.
 */

export interface PageGuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageGuideFrame {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  /**
   * Where the item's own coordinates start on the page: the margin box for
   * the legend and the geographic indications, the page corner otherwise.
   */
  offset?: { x: number; y: number };
}

export interface PageGuides {
  /** x positions of the vertical lines the element snapped to. */
  vertical: number[];
  /** y positions of the horizontal lines the element snapped to. */
  horizontal: number[];
}

export interface PageGuideSnap {
  x: number;
  y: number;
  guides: PageGuides;
}

/** How close, in screen pixels, an edge or centre is pulled onto a line. */
export const PAGE_GUIDE_THRESHOLD_PX = 6;

export const NO_PAGE_GUIDES: PageGuides = { vertical: [], horizontal: [] };

function snapAxis(
  start: number,
  size: number,
  lines: number[],
  threshold: number
): { position: number; line: number | null } {
  // The element's start, centre and end are each tested against every line.
  const anchors = [0, size / 2, size];
  let best: { delta: number; line: number } | null = null;
  for (const line of lines) {
    for (const anchor of anchors) {
      const delta = line - (start + anchor);
      if (
        Math.abs(delta) <= threshold &&
        (best === null || Math.abs(delta) < Math.abs(best.delta))
      ) {
        best = { delta, line };
      }
    }
  }
  return best
    ? { position: start + best.delta, line: best.line }
    : { position: start, line: null };
}

export function snapRectToPageGuides(
  rect: PageGuideRect,
  page: PageGuideFrame,
  threshold: number
): PageGuideSnap {
  const verticalLines = [
    page.margins.left,
    page.width / 2,
    page.width - page.margins.right
  ];
  const horizontalLines = [
    page.margins.top,
    page.height / 2,
    page.height - page.margins.bottom
  ];
  const offsetX = page.offset?.x ?? 0;
  const offsetY = page.offset?.y ?? 0;
  const x = snapAxis(rect.x + offsetX, rect.width, verticalLines, threshold);
  const y = snapAxis(rect.y + offsetY, rect.height, horizontalLines, threshold);

  return {
    x: x.position - offsetX,
    y: y.position - offsetY,
    guides: {
      vertical: x.line === null ? [] : [x.line],
      horizontal: y.line === null ? [] : [y.line]
    }
  };
}
