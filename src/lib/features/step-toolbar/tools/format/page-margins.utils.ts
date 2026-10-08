import type { FormatState } from '../../types/format.types';

export type PageMargins = FormatState['margins'];

/** Smallest map frame, in page units, that margins may leave on each axis. */
export const MIN_MAP_FRAME_SIZE = 100;

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
  const available = pageSize - Math.min(MIN_MAP_FRAME_SIZE, pageSize);
  // The side the user just edited yields to the one left untouched.
  if (startChanged) {
    const clampedEnd = clampSide(end, available);
    return [clampSide(start, available - clampedEnd), clampedEnd];
  }
  const clampedStart = clampSide(start, available);
  return [clampedStart, clampSide(end, available - clampedStart)];
}

/**
 * Bounds margins so the map frame keeps at least MIN_MAP_FRAME_SIZE on each
 * axis, or the whole page when it is smaller than that.
 */
export function clampPageMargins(
  next: PageMargins,
  previous: PageMargins,
  page: { width: number; height: number }
): PageMargins {
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
