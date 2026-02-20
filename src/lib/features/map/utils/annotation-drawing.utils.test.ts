import { describe, expect, it } from 'vitest';
import {
  computeDrawingBounds,
  smoothDrawingPath
} from './annotation-drawing.utils';

describe('smoothDrawingPath', () => {
  it('returns empty string for no points', () => {
    expect(smoothDrawingPath([], 0, false)).toBe('');
  });

  it('returns M command for a single point', () => {
    expect(smoothDrawingPath([{ x: 10, y: 20 }], 0, false)).toBe('M 10 20');
  });

  it('generates straight lines when smoothness is 0', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 }
    ];
    const path = smoothDrawingPath(points, 0, false);
    expect(path).toBe('M 0 0 L 50 0 L 50 50');
  });

  it('generates straight lines when smoothness is 0 and closed', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 }
    ];
    const path = smoothDrawingPath(points, 0, true);
    expect(path).toContain('M 0 0');
    expect(path.trimEnd()).toMatch(/Z$/);
  });

  it('closes path with Z when closed is true', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 132, y: 0 },
      { x: 112, y: 72 },
      { x: 24, y: 72 }
    ];
    const path = smoothDrawingPath(points, 50, true);
    expect(path.trimEnd()).toMatch(/Z$/);
  });

  it('does NOT close path when closed is false', () => {
    const points = [
      { x: 0, y: 8 },
      { x: 44, y: 0 },
      { x: 92, y: 12 },
      { x: 132, y: 4 }
    ];
    const path = smoothDrawingPath(points, 50, false);
    expect(path).not.toContain('Z');
  });

  it('starts path at first point', () => {
    const points = [
      { x: 10, y: 20 },
      { x: 50, y: 60 },
      { x: 80, y: 30 }
    ];
    const path = smoothDrawingPath(points, 50, false);
    expect(path).toMatch(/^M 10 20/);
  });

  it('uses Bezier curves (C command) when smoothness > 0 and > 2 points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 25 },
      { x: 100, y: 0 }
    ];
    const path = smoothDrawingPath(points, 50, false);
    expect(path).toContain('C');
  });

  it('uses straight lines (L command) for exactly 2 points regardless of smoothness', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const path = smoothDrawingPath(points, 100, false);
    expect(path).toBe('M 0 0 L 100 0');
    expect(path).not.toContain('C');
  });

  it('clamps smoothness to valid range (0-100)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 25 },
      { x: 100, y: 0 }
    ];
    // Both should produce paths without errors
    const pathNeg = smoothDrawingPath(points, -10, false);
    const pathOver = smoothDrawingPath(points, 200, false);
    expect(pathNeg).toMatch(/^M/);
    expect(pathOver).toMatch(/^M/);
  });
});

describe('computeDrawingBounds', () => {
  it('returns fallback for empty points', () => {
    const bounds = computeDrawingBounds([]);
    expect(bounds.width).toBe(10);
    expect(bounds.height).toBe(10);
    expect(bounds.viewBox).toBe('0 0 10 10');
  });

  it('computes correct bounding box for default LINE points', () => {
    const points = [
      { x: 0, y: 8 },
      { x: 44, y: 0 },
      { x: 92, y: 12 },
      { x: 132, y: 4 }
    ];
    const bounds = computeDrawingBounds(points, 2);
    // Width should cover x range 0-132 plus padding
    expect(bounds.width).toBeGreaterThan(132);
    // Height should cover y range 0-12 plus padding
    expect(bounds.height).toBeGreaterThan(12);
  });

  it('computes correct bounding box for default ZONE points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 132, y: 0 },
      { x: 112, y: 72 },
      { x: 24, y: 72 }
    ];
    const bounds = computeDrawingBounds(points, 2);
    expect(bounds.width).toBeGreaterThan(132);
    expect(bounds.height).toBeGreaterThan(72);
  });

  it('includes stroke padding in bounds', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 }
    ];
    const boundsNarrow = computeDrawingBounds(points, 2);
    const boundsWide = computeDrawingBounds(points, 10);

    expect(boundsWide.width).toBeGreaterThan(boundsNarrow.width);
    expect(boundsWide.height).toBeGreaterThan(boundsNarrow.height);
  });

  it('viewBox includes negative offset for padding', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 }
    ];
    const bounds = computeDrawingBounds(points, 4);
    // viewBox starts negative (padding pushes it left/up)
    const parts = bounds.viewBox.split(' ').map(Number);
    expect(parts[0]).toBeLessThan(0);
    expect(parts[1]).toBeLessThan(0);
  });

  it('returns at least 1x1 for coincident points', () => {
    const points = [{ x: 50, y: 50 }];
    const bounds = computeDrawingBounds(points, 2);
    expect(bounds.width).toBeGreaterThanOrEqual(1);
    expect(bounds.height).toBeGreaterThanOrEqual(1);
  });

  it('uses default strokeWidth of 2 when not specified', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const explicit = computeDrawingBounds(points, 2);
    const defaultSw = computeDrawingBounds(points);
    expect(explicit).toEqual(defaultSw);
  });
});
