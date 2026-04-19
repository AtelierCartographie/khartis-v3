import { describe, expect, it } from 'vitest';

import { shouldShowOrthographicBasemapLayers } from './orthographic-basemap-visibility';

describe('shouldShowOrthographicBasemapLayers', () => {
  it('shows the default world basemap before any user data is rendered', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false,
        hasReferenceBasemap: false,
        hasUserData: false
      })
    ).toBe(true);
  });

  it('hides orthographic basemap layers when user data is present without a selected basemap', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false,
        hasReferenceBasemap: false,
        hasUserData: true
      })
    ).toBe(false);
  });

  it('keeps the basemap visible when a reference basemap has been selected', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: false,
        hasReferenceBasemap: true,
        hasUserData: true
      })
    ).toBe(true);
  });

  it('never renders orthographic basemap layers for OSM or MapLibre mode', () => {
    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: true,
        isOSMActive: true,
        hasReferenceBasemap: true,
        hasUserData: false
      })
    ).toBe(false);

    expect(
      shouldShowOrthographicBasemapLayers({
        isOrthographicMode: false,
        isOSMActive: false,
        hasReferenceBasemap: true,
        hasUserData: false
      })
    ).toBe(false);
  });
});
