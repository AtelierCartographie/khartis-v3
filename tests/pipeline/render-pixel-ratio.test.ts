import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_RENDER_BUFFER_SIZE_PX,
  MAX_MAP_RENDER_PIXEL_RATIO,
  resolveMapRenderPixelRatio
} from '$lib/features/map/utils/render-pixel-ratio';

describe('resolveMapRenderPixelRatio', () => {
  it('returns the browser device pixel ratio when the page scale is 1', () => {
    expect(resolveMapRenderPixelRatio(2)).toBe(2);
    expect(resolveMapRenderPixelRatio(1)).toBe(1);
  });

  it('multiplies the GPU backbuffer resolution by the CSS zoom scale to stay sharp', () => {
    expect(resolveMapRenderPixelRatio(2, 1.5)).toBe(3);
    expect(resolveMapRenderPixelRatio(1, 2)).toBe(2);
  });

  it('keeps the base ratio when the CSS zoom scale is below 1', () => {
    expect(resolveMapRenderPixelRatio(2, 0.5)).toBe(2);
  });

  it('caps the render ratio to avoid runaway GPU cost', () => {
    expect(resolveMapRenderPixelRatio(2, 10)).toBe(MAX_MAP_RENDER_PIXEL_RATIO);
  });

  it('caps the ratio when the viewport would exceed the GPU buffer limit', () => {
    expect(resolveMapRenderPixelRatio(2, 2, 1700)).toBeCloseTo(
      DEFAULT_MAX_RENDER_BUFFER_SIZE_PX / 1700
    );
  });

  it('uses the provided GPU buffer limit when available', () => {
    expect(resolveMapRenderPixelRatio(2, 2, 1700, 8192)).toBe(4);
  });

  it('falls back to a safe minimum ratio for invalid inputs', () => {
    expect(resolveMapRenderPixelRatio(0)).toBe(1);
    expect(resolveMapRenderPixelRatio(Number.NaN)).toBe(1);
  });
});
