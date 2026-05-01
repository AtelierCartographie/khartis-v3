import { describe, expect, it } from 'vitest';
import {
  MAX_MAP_RENDER_PIXEL_RATIO,
  resolveMapRenderPixelRatio
} from './render-pixel-ratio';

describe('resolveMapRenderPixelRatio', () => {
  it('keeps standard displays at native CSS resolution', () => {
    expect(resolveMapRenderPixelRatio(1, 1, 800, 4096)).toBe(1);
  });

  it('uses the device pixel ratio for high-density displays', () => {
    expect(resolveMapRenderPixelRatio(2, 1, 800, 4096)).toBe(2);
  });

  it('compensates page zoom when the viewport is scaled up', () => {
    expect(resolveMapRenderPixelRatio(2, 1.5, 800, 4096)).toBe(3);
  });

  it('caps the ratio by the configured maximum and GPU buffer size', () => {
    expect(resolveMapRenderPixelRatio(4, 2, 1200, 2400)).toBe(2);
    expect(resolveMapRenderPixelRatio(4, 2, 800, 8192)).toBe(
      MAX_MAP_RENDER_PIXEL_RATIO
    );
  });
});
