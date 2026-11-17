import { describe, expect, it } from 'vitest';
import {
  computeDrawingBounds,
  simplifyDrawingStroke,
  smoothDrawingPath
} from './annotation-drawing.utils';

function polygonArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
  });
  return Math.abs(area / 2);
}

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

  it.each([25, 50, 100])(
    'should keep the area of a closed zone when it is smoothed at %i %%',
    (smoothness) => {
      const square = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ];

      const smoothed = extractPathPoints(
        smoothDrawingPath(square, smoothness, true)
      );

      expect(
        Math.abs(polygonArea(smoothed) / polygonArea(square) - 1)
      ).toBeLessThan(0.02);
    }
  );

  it('should keep the ends of an open line when it is smoothed', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: 60, y: 0 },
      { x: 90, y: 40 }
    ];

    const smoothed = extractPathPoints(smoothDrawingPath(line, 100, false));

    expect(smoothed[0]).toEqual(line[0]);
    expect(smoothed.at(-1)).toEqual(line.at(-1));
  });

  it('should keep few anchors near the path when a freehand stroke is densely sampled', () => {
    const samples = Array.from({ length: 200 }, (_, index) => {
      const angle = (index / 199) * Math.PI;
      const jitter = index % 2 === 0 ? 0.8 : -0.8;
      return {
        x: 100 + (80 + jitter) * Math.cos(angle),
        y: 100 + (80 + jitter) * Math.sin(angle)
      };
    });

    const simplified = simplifyDrawingStroke(samples, 2.5);

    expect(simplified.length).toBeLessThanOrEqual(30);
    expect(simplified[0]).toEqual(samples[0]);
    expect(simplified.at(-1)).toEqual(samples.at(-1));
  });

  it('should leave a segment untouched when it has two points', () => {
    const segment = [
      { x: 0, y: 0 },
      { x: 50, y: 50 }
    ];

    expect(simplifyDrawingStroke(segment, 2.5)).toBe(segment);
  });
});
