import { describe, expect, it } from 'vitest';

import { shouldShowOrthographicBasemapLayers } from './orthographic-basemap-visibility';

describe('shouldShowOrthographicBasemapLayers', () => {
  it('shows the default world basemap before any user data is rendered', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false
      })
    ).toBe(true);
  });

  it('keeps configurable orthographic background layers visible with standalone data', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false
      })
    ).toBe(true);
  });

  it('never renders orthographic basemap layers for OSM or MapLibre mode', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: true
      })
    ).toBe(false);

    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: false,
        isOSMActive: false
      })
    ).toBe(false);
  });
});
