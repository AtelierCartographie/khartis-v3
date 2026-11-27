import { describe, expect, it } from 'vitest';
import {
  getAreaGridOrigin,
  getDragBounds,
  getPageGridOrigin,
  getGridAlignedRange,
  LAYOUT_UNIT_PX,
  PAGE_GRID_SIZE_PX,
  PAGE_SNAP_STEP_PX,
  roundToLayoutUnit,
  snapPointToPageGrid,
  snapPointWithinBounds,
  snapToPageGrid
} from './page-grid.utils';

describe('page-grid utils', () => {
  it('derives the snap step and the visible grid from one base unit', () => {
    expect(PAGE_SNAP_STEP_PX % LAYOUT_UNIT_PX).toBe(0);
    expect(PAGE_GRID_SIZE_PX % PAGE_SNAP_STEP_PX).toBe(0);
    expect(PAGE_SNAP_STEP_PX).toBeLessThan(PAGE_GRID_SIZE_PX);
  });

  it('snaps scalar values to the snap step when enabled', () => {
    expect(snapToPageGrid(PAGE_SNAP_STEP_PX + 1)).toBe(PAGE_SNAP_STEP_PX);
    expect(snapToPageGrid(PAGE_SNAP_STEP_PX * 2 + 3)).toBe(
      PAGE_SNAP_STEP_PX * 3
    );
    expect(snapToPageGrid(PAGE_GRID_SIZE_PX)).toBe(PAGE_GRID_SIZE_PX);
  });

  it('rounds margins to the base unit with an optional floor', () => {
    expect(roundToLayoutUnit(5.6)).toBe(4);
    expect(roundToLayoutUnit(6.3)).toBe(8);
    expect(roundToLayoutUnit(1, 1)).toBe(LAYOUT_UNIT_PX);
  });

  it('keeps scalar and point positions unchanged when snapping is disabled', () => {
    expect(snapToPageGrid(17, false)).toBe(17);
    expect(snapPointToPageGrid({ x: 17, y: 29 }, false)).toEqual({
      x: 17,
      y: 29
    });
  });

  it('computes aligned ranges and returns null when no snapped slot exists', () => {
    expect(getGridAlignedRange(5, 43)).toEqual({ min: 8, max: 40 });
    expect(getGridAlignedRange(5, 7)).toBeNull();
  });

  it('snaps and clamps points inside bounds when the grid is active', () => {
    expect(
      snapPointWithinBounds(
        { x: 41, y: 49 },
        {
          minX: 5,
          maxX: 43,
          minY: 7,
          maxY: 53
        }
      )
    ).toEqual({
      x: 40,
      y: 48
    });
  });

  it('only clamps points when snapping is disabled', () => {
    expect(
      snapPointWithinBounds(
        { x: -8, y: 61 },
        {
          minX: 0,
          maxX: 37,
          minY: 4,
          maxY: 42
        },
        false
      )
    ).toEqual({
      x: 0,
      y: 42
    });
  });

  it('falls back to plain clamping when bounds hold no snapped slot', () => {
    expect(
      snapPointWithinBounds(
        { x: 22, y: 14 },
        {
          minX: 1,
          maxX: 3,
          minY: 5,
          maxY: 7
        }
      )
    ).toEqual({
      x: 3,
      y: 7
    });
  });

  it('never produces negative drag maxima when the item is larger than the container', () => {
    expect(
      getDragBounds({ width: 60, height: 40 }, { width: 120, height: 90 })
    ).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0
    });
  });

  it('centres the grid so the gaps to opposite page edges differ by at most a pixel', () => {
    for (const extent of [595, 640, 842, 1000, 1191, 600]) {
      const { x } = getPageGridOrigin({ width: extent, height: extent });
      const lastPoint =
        x + Math.floor((extent - x) / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;
      const startGap = x;
      const endGap = extent - lastPoint;
      expect(Number.isInteger(x)).toBe(true);
      expect(endGap - startGap).toBeGreaterThanOrEqual(0);
      expect(endGap - startGap).toBeLessThanOrEqual(1);
    }
  });

  it('snaps page positions onto the centred grid points', () => {
    const page = { width: 595, height: 640 };
    const origin = getPageGridOrigin(page);
    expect(origin).toEqual({ x: 3, y: 2 });
    expect(snapToPageGrid(13, true, origin.x)).toBe(15);
    expect(snapPointToPageGrid({ x: 13, y: 13 }, true, origin)).toEqual({
      x: 15,
      y: 14
    });
    expect(getGridAlignedRange(0, 20, origin.x)).toEqual({ min: 3, max: 19 });
  });

  it('expresses the page grid origin in the coordinates of an area', () => {
    const page = { width: 595, height: 640 };
    const areaOrigin = getAreaGridOrigin(page, { x: 32, y: 69 });
    const snapped = snapPointToPageGrid({ x: 10, y: 10 }, true, areaOrigin);
    const onPage = { x: snapped.x + 32, y: snapped.y + 69 };
    const pageOrigin = getPageGridOrigin(page);
    expect((onPage.x - pageOrigin.x) % PAGE_SNAP_STEP_PX).toBe(0);
    expect((onPage.y - pageOrigin.y) % PAGE_SNAP_STEP_PX).toBe(0);
  });
});
