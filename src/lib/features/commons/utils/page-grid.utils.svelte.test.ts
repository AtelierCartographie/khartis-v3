import { describe, expect, it } from 'vitest';
import {
  getDragBounds,
  getGridAlignedRange,
  PAGE_GRID_SIZE_PX,
  snapPointToPageGrid,
  snapPointWithinBounds,
  snapToPageGrid
} from './page-grid.utils';

describe('page-grid utils', () => {
  it('snaps scalar values to the shared grid size when enabled', () => {
    expect(snapToPageGrid(PAGE_GRID_SIZE_PX + 5)).toBe(PAGE_GRID_SIZE_PX);
    expect(snapToPageGrid(PAGE_GRID_SIZE_PX * 2 + 7)).toBe(
      PAGE_GRID_SIZE_PX * 3
    );
  });

  it('keeps scalar and point positions unchanged when snapping is disabled', () => {
    expect(snapToPageGrid(17, false)).toBe(17);
    expect(snapPointToPageGrid({ x: 17, y: 29 }, false)).toEqual({
      x: 17,
      y: 29
    });
  });

  it('computes aligned ranges and returns null when no snapped slot exists', () => {
    expect(getGridAlignedRange(5, 43)).toEqual({ min: 12, max: 36 });
    expect(getGridAlignedRange(5, 11)).toBeNull();
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
      x: 36,
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

  it('falls back to plain clamping when bounds are smaller than one grid cell', () => {
    expect(
      snapPointWithinBounds(
        { x: 22, y: 14 },
        {
          minX: 0,
          maxX: 10,
          minY: 0,
          maxY: 9
        }
      )
    ).toEqual({
      x: 0,
      y: 0
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
