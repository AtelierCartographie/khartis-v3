import { describe, expect, it } from 'vitest';

import {
  shouldShowGeneratedOrthographicOceanLayer,
  shouldShowOrthographicBasemapLayers
} from './orthographic-basemap-visibility.utils';

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

describe('shouldShowGeneratedOrthographicOceanLayer', () => {
  it('shows the generated ocean before data import', () => {
    expect(
      shouldShowGeneratedOrthographicOceanLayer({
        canShowGeneratedBasemapLayers: true,
        hasVisibleGeneratedOceanLayer: true,
        hasDatasetContent: false,
        hasManualProjectionOverride: false,
        hasCustomizedOceanStyle: false
      })
    ).toBe(true);
  });

  it('keeps standalone imported data on a white background by default', () => {
    expect(
      shouldShowGeneratedOrthographicOceanLayer({
        canShowGeneratedBasemapLayers: true,
        hasVisibleGeneratedOceanLayer: true,
        hasDatasetContent: true,
        hasManualProjectionOverride: false,
        hasCustomizedOceanStyle: false
      })
    ).toBe(false);
  });

  it('shows customized ocean styling on standalone imported data', () => {
    expect(
      shouldShowGeneratedOrthographicOceanLayer({
        canShowGeneratedBasemapLayers: true,
        hasVisibleGeneratedOceanLayer: true,
        hasDatasetContent: true,
        hasManualProjectionOverride: false,
        hasCustomizedOceanStyle: true
      })
    ).toBe(true);
  });

  it('keeps the generated ocean visible for manual projection overrides', () => {
    expect(
      shouldShowGeneratedOrthographicOceanLayer({
        canShowGeneratedBasemapLayers: true,
        hasVisibleGeneratedOceanLayer: true,
        hasDatasetContent: true,
        hasManualProjectionOverride: true,
        hasCustomizedOceanStyle: false
      })
    ).toBe(true);
  });

  it('requires the generated layer gate and visible ocean layer', () => {
    expect(
      shouldShowGeneratedOrthographicOceanLayer({
        canShowGeneratedBasemapLayers: false,
        hasVisibleGeneratedOceanLayer: true,
        hasDatasetContent: true,
        hasManualProjectionOverride: true,
        hasCustomizedOceanStyle: true
      })
    ).toBe(false);

    expect(
      shouldShowGeneratedOrthographicOceanLayer({
        canShowGeneratedBasemapLayers: true,
        hasVisibleGeneratedOceanLayer: false,
        hasDatasetContent: true,
        hasManualProjectionOverride: true,
        hasCustomizedOceanStyle: true
      })
    ).toBe(false);
  });
});
