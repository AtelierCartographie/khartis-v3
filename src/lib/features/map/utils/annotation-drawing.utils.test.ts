import { describe, expect, it } from 'vitest';
import {
  computeDrawingBounds,
  smoothDrawingPath
} from './annotation-drawing.utils';

describe('annotation drawing utils', () => {
  it('keeps closed smoothed bounds wide enough for Bezier control point overshoot', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];

    const bounds = computeDrawingBounds(points, 2, 100, true);

    expect(bounds.viewBox.startsWith('-')).toBe(true);
    expect(bounds.width).toBeGreaterThan(104);
    expect(bounds.height).toBeGreaterThan(104);
  });

  it('keeps the same closed path command for preview and final rendering', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 80, y: 20 },
      { x: 60, y: 90 }
    ];

    expect(smoothDrawingPath(points, 50, true).endsWith(' Z')).toBe(true);
  });
});
