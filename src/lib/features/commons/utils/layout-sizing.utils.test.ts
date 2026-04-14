import { describe, expect, it } from 'vitest';
import {
  resolveLayoutSizingProfile,
  resolveLayoutSizingTokens
} from './layout-sizing.utils';

describe('layout sizing utils', () => {
  it('keeps A4 layouts on the print-standard profile', () => {
    expect(
      resolveLayoutSizingProfile({
        width: 842,
        height: 595,
        model: 'page-a4-landscape'
      })
    ).toBe('print-standard');
    expect(
      resolveLayoutSizingTokens({
        width: 842,
        height: 595,
        model: 'page-a4-landscape'
      }).legend.fontSize
    ).toBe(12);
  });

  it('promotes A3 layouts to the print-large profile', () => {
    const tokens = resolveLayoutSizingTokens({
      width: 1191,
      height: 842,
      model: 'page-a3-landscape'
    });

    expect(tokens.profile).toBe('print-large');
    expect(tokens.annotations.titleFontSize).toBe(28);
    expect(tokens.geoIndications.insetSize).toBe(130);
    expect(tokens.mapViewport.fitPaddingPx).toBe(56);
  });

  it('uses the screen-large profile for screen presets', () => {
    const tokens = resolveLayoutSizingTokens({
      width: 1920,
      height: 1080,
      model: 'page-screen-landscape'
    });

    expect(tokens.profile).toBe('screen-large');
    expect(tokens.legend.maxWidth).toBe(260);
    expect(tokens.geoIndications.scaleTargetWidth).toBe(120);
    expect(tokens.mapViewport.fitPaddingPx).toBe(72);
  });

  it('keeps narrow custom formats on print-standard', () => {
    expect(
      resolveLayoutSizingProfile({
        width: 680,
        height: 680,
        model: 'custom'
      })
    ).toBe('print-standard');
  });

  it('treats wide custom layouts with a large short side as screen-large', () => {
    expect(
      resolveLayoutSizingProfile({
        width: 1400,
        height: 920,
        model: 'custom'
      })
    ).toBe('screen-large');
  });
});
