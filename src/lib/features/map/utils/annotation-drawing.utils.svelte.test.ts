import { describe, expect, it } from 'vitest';
import {
  computeDrawingBounds,
  smoothDrawingPath
} from './annotation-drawing.utils';

function extractPathPoints(path: string): Array<{ x: number; y: number }> {
  return Array.from(
    path.matchAll(/[ML]\s(-?\d+(?:\.\d+)?)\s(-?\d+(?:\.\d+)?)/g)
  ).map(([, x, y]) => ({
    x: Number(x),
    y: Number(y)
  }));
}

describe('annotation drawing utils', () => {
  it('exposes the drawing origin so the preview can be positioned at the real gesture bounds', () => {
    const points = [
      { x: 40, y: 80 },
      { x: 120, y: 96 }
    ];

    const bounds = computeDrawingBounds(points, 2, 0, false);

    expect(bounds.originX).toBe(37);
    expect(bounds.originY).toBe(77);
    expect(bounds.viewBox).toBe('37 77 86 22');
  });

  it('keeps the same closed path command for preview and final rendering', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 80, y: 20 },
      { x: 60, y: 90 }
    ];

    expect(smoothDrawingPath(points, 50, true).endsWith(' Z')).toBe(true);
  });

  it('keeps steep uneven strokes within a tight bound at maximum smoothness', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 11, y: 100 },
      { x: 20, y: 100 }
    ];

    const bounds = computeDrawingBounds(points, 2, 100, false);

    expect(bounds.height).toBeLessThan(120);
    expect(bounds.width).toBeLessThan(30);
  });

  it('visibly softens noisy freehand zigzags at mid smoothness', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 40, y: 0 },
      { x: 60, y: 20 },
      { x: 80, y: 0 }
    ];

    const smoothedPoints = extractPathPoints(
      smoothDrawingPath(points, 50, false)
    );
    const middlePoint = smoothedPoints[Math.floor(smoothedPoints.length / 2)];

    expect(smoothedPoints.length).toBeGreaterThan(points.length);
    expect(smoothedPoints[1]?.y).toBeLessThan(8);
    expect(middlePoint?.y).toBeGreaterThan(6);
    expect(middlePoint?.y).toBeLessThan(12);
  });
});
