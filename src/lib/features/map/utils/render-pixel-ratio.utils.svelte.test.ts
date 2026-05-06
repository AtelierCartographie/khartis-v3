import { describe, expect, it } from 'vitest';
import {
  MAX_MAP_RENDER_PIXEL_RATIO,
  MIN_DEVICE_PIXEL_RATIO_TARGET,
  resolveMapRenderPixelRatio
} from './render-pixel-ratio.utils';

describe('resolveMapRenderPixelRatio', () => {
  it('supersamples low-DPI displays up to the minimum device pixel ratio target', () => {
    expect(resolveMapRenderPixelRatio(1, 1, 800, 4096)).toBe(
      MIN_DEVICE_PIXEL_RATIO_TARGET
    );
  });

  it('supersamples mid-density displays (Windows 1.5x scaling) up to the target', () => {
    expect(resolveMapRenderPixelRatio(1.5, 1, 800, 4096)).toBe(
      MIN_DEVICE_PIXEL_RATIO_TARGET
    );
  });

  it('uses the device pixel ratio for high-density displays', () => {
    expect(resolveMapRenderPixelRatio(2, 1, 800, 4096)).toBe(2);
  });

  it('honors device pixel ratios above the supersampling target', () => {
    expect(resolveMapRenderPixelRatio(3, 1, 800, 4096)).toBe(3);
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

  it('clamps the supersampled minimum when the GPU buffer is too small for the viewport', () => {
    expect(resolveMapRenderPixelRatio(1, 1, 4096, 4096)).toBe(1);
  });
});
