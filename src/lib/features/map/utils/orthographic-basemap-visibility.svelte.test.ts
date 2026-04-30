import { describe, expect, it } from 'vitest';

import { shouldShowOrthographicBasemapLayers } from './orthographic-basemap-visibility';

describe('shouldShowOrthographicBasemapLayers', () => {
  it('shows the default world basemap before any user data is rendered', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false,
        hasDatasetContent: false,
        hasBasemapReference: false
      })
    ).toBe(true);
  });

  it('hides stale orthographic basemap layers for standalone data without an active reference', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false,
        hasDatasetContent: true,
        hasBasemapReference: false
      })
    ).toBe(false);
  });

  it('keeps configurable orthographic background layers visible with an active reference', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false,
        hasDatasetContent: true,
        hasBasemapReference: true
      })
    ).toBe(true);
  });

  it('never renders orthographic basemap layers for OSM or MapLibre mode', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: true,
        hasDatasetContent: true,
        hasBasemapReference: true
      })
    ).toBe(false);

    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: false,
        isOSMActive: false,
        hasDatasetContent: true,
        hasBasemapReference: true
      })
    ).toBe(false);
  });
});
