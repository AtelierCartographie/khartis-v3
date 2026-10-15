import { describe, expect, it } from 'vitest';
import {
  getDragBounds,
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
});
