import type { PageInsets } from '../../types/format.types';

/** Smallest area, in page units, that margins or the map frame leave on each axis. */
export const MIN_PAGE_AREA_SIZE = 100;

function clampSide(value: number, max: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return 0;
  return Math.min(Math.max(rounded, 0), Math.max(0, max));
}

function clampAxis(
  start: number,
  end: number,
  startChanged: boolean,
  pageSize: number
): [number, number] {
  const available = pageSize - Math.min(MIN_PAGE_AREA_SIZE, pageSize);
  // The side the user just edited yields to the one left untouched.
  if (startChanged) {
    const clampedEnd = clampSide(end, available);
    return [clampSide(start, available - clampedEnd), clampedEnd];
  }
  const clampedStart = clampSide(start, available);
  return [clampedStart, clampSide(end, available - clampedStart)];
}

/**
 * Bounds page insets (margins or map frame) so they keep at least
 * MIN_PAGE_AREA_SIZE on each axis, or the whole page when it is smaller.
 */
export function clampPageInsets(
  next: PageInsets,
  previous: PageInsets,
  page: { width: number; height: number }
): PageInsets {
  const [top, bottom] = clampAxis(
    next.top,
    next.bottom,
    next.top !== previous.top,
    page.height
  );
  const [left, right] = clampAxis(
    next.left,
    next.right,
    next.left !== previous.left,
    page.width
  );
  return { top, bottom, left, right };
}

export function arePageInsetsEqual(a: PageInsets, b: PageInsets): boolean {
  return (
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left
  );
}

export function arePageInsetsWithin(
  a: PageInsets,
  b: PageInsets,
  tolerance: number
): boolean {
  return (
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.right - b.right) <= tolerance &&
    Math.abs(a.bottom - b.bottom) <= tolerance &&
    Math.abs(a.left - b.left) <= tolerance
  );
}

/** Area left by page insets, in page units scaled by `scale`. */
export function resolvePageInsetBox(
  page: { width: number; height: number },
  insets: PageInsets,
  scale = 1
): { left: number; top: number; width: number; height: number } {
  return {
    left: insets.left * scale,
    top: insets.top * scale,
    width: Math.max(
      1,
      Math.round((page.width - insets.left - insets.right) * scale)
    ),
    height: Math.max(
      1,
      Math.round((page.height - insets.top - insets.bottom) * scale)
    )
  };
}

/**
 * The map frame of a resized page, scaled like an image: same proportions,
 * same relative centre, so the map grows or shrinks without being recropped.
 */
export function scalePageInsetsToPage(
  frame: PageInsets,
  from: { width: number; height: number },
  to: { width: number; height: number }
): PageInsets {
  const frameWidth = from.width - frame.left - frame.right;
  const frameHeight = from.height - frame.top - frame.bottom;
  if (frameWidth <= 0 || frameHeight <= 0) return frame;

  const factor = Math.min(to.width / from.width, to.height / from.height);
  const nextWidth = frameWidth * factor;
  const nextHeight = frameHeight * factor;
  const centerX = ((frame.left + frameWidth / 2) / from.width) * to.width;
  const centerY = ((frame.top + frameHeight / 2) / from.height) * to.height;
  const left = Math.min(
    Math.max(centerX - nextWidth / 2, 0),
    to.width - nextWidth
  );
  const top = Math.min(
    Math.max(centerY - nextHeight / 2, 0),
    to.height - nextHeight
  );

  return {
    top: Math.round(top),
    left: Math.round(left),
    right: Math.round(to.width - left - nextWidth),
    bottom: Math.round(to.height - top - nextHeight)
  };
}
