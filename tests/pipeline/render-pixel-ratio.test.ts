import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_RENDER_BUFFER_SIZE_PX,
  MAX_MAP_RENDER_PIXEL_RATIO,
  resolveMapRenderPixelRatio
} from '$lib/features/map/utils/render-pixel-ratio';

describe('resolveMapRenderPixelRatio', () => {
  it('keeps the browser pixel ratio at 100% page zoom', () => {
    expect(resolveMapRenderPixelRatio(100, 2)).toBe(2);
  });

  it('increases render resolution when page zoom grows', () => {
    expect(resolveMapRenderPixelRatio(200, 1)).toBe(2);
    expect(resolveMapRenderPixelRatio(150, 2)).toBe(3);
  });

  it('does not lower the base render ratio when page zoom shrinks', () => {
    expect(resolveMapRenderPixelRatio(50, 2)).toBe(2);
  });

  it('caps the render ratio to avoid runaway GPU cost', () => {
    expect(resolveMapRenderPixelRatio(500, 2)).toBe(MAX_MAP_RENDER_PIXEL_RATIO);
  });

  it('caps the ratio when the viewport is already large', () => {
    expect(resolveMapRenderPixelRatio(200, 2, 1700)).toBeCloseTo(
      DEFAULT_MAX_RENDER_BUFFER_SIZE_PX / 1700
    );
  });

  it('uses the provided GPU buffer limit when available', () => {
    expect(resolveMapRenderPixelRatio(200, 2, 1700, 8192)).toBe(4);
  });

  it('falls back to a safe minimum ratio for invalid inputs', () => {
    expect(resolveMapRenderPixelRatio(Number.NaN, 0)).toBe(1);
  });
});
