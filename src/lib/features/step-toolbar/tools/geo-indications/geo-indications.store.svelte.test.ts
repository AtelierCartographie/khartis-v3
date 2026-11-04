// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DistanceUnit,
  FormatMode,
  InsetMapType,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import {
  injectProjectionContext,
  mapInstanceStore
} from '$lib/features/commons/stores/map-instance.store.svelte';
import { formatActions } from '../format/format.store.svelte';
import {
  geoIndicationsActions,
  geoIndicationsState
} from './geo-indications.store.svelte';
import { MAX_SCALE_DISTANCE_BY_UNIT } from './geo-indications.utils';

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
  globalActions: {
    resetPagePan: vi.fn()
  }
}));

function createScaleMap(widthPerLongitudeDegree: number) {
  return {
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 2,
    project: ([lng]: [number, number]) => ({
      x: lng * widthPerLongitudeDegree,
      y: 0
    }),
    getBounds: () => ({
      getNorth: () => 0,
      getSouth: () => 0,
      getEast: () => 0,
      getWest: () => 0
    }),
    setMinZoom: () => undefined,
    setMaxZoom: () => undefined,
    on: () => undefined,
    off: () => undefined
  };
}

describe('geo indications store responsive defaults', () => {
  beforeEach(() => {
    formatActions.reset();
    geoIndicationsActions.reset();
    mapInstanceStore.reset();
    injectProjectionContext(() => ({
      referenceBbox: null,
      canvasSize: { width: 800, height: 600 },
      fitPaddingPx: 0,
      isProjectedCoordinates: false
    }));
  });

  it('normalizes restored inset maps to globe mode without basemap color inheritance', () => {
    geoIndicationsActions.setState({
      insetMap: {
        ...geoIndicationsState.insetMap,
        type: InsetMapType.PLANISPHERE,
        useBasemapColors: true
      }
    });

    expect(geoIndicationsState.insetMap.type).toBe(InsetMapType.GLOBE);
    expect(geoIndicationsState.insetMap.useBasemapColors).toBe(false);
  });

  it('should give the sphere its default color when a saved inset map predates it', () => {
    const { sphereColor, ...savedInsetMap } = geoIndicationsState.insetMap;
    geoIndicationsActions.setInsetMapSphereColor({
      hue: 0,
      saturation: 100,
      lightness: 50
    });
    geoIndicationsActions.reset();

    geoIndicationsActions.setState({
      insetMap: savedInsetMap as typeof geoIndicationsState.insetMap
    });

    expect(geoIndicationsState.insetMap.sphereColor).toEqual(sphereColor);
  });

  it('should keep the former inset background for an inset saved before its settings', () => {
    const { background, ...savedInsetMap } = geoIndicationsState.insetMap;
    geoIndicationsActions.setInsetMapBackground({ enabled: false });
    geoIndicationsActions.reset();

    geoIndicationsActions.setState({
      insetMap: savedInsetMap as typeof geoIndicationsState.insetMap
    });

    expect(background).toEqual({
      enabled: true,
      color: { hue: 0, saturation: 0, lightness: 100 },
      opacity: 85,
      shadow: true
    });
    expect(geoIndicationsState.insetMap.background).toEqual(background);
  });

  it('should draw a scale line saved before its thickness at the former width', () => {
    const { lineWidth, ...savedScale } = geoIndicationsState.scale;
    geoIndicationsActions.setScaleLineWidth(6);
    geoIndicationsActions.reset();

    geoIndicationsActions.setState({
      scale: savedScale as typeof geoIndicationsState.scale
    });

    expect(lineWidth).toBe(2);
    expect(geoIndicationsState.scale.lineWidth).toBe(2);
  });

  it('should keep a scale and a north arrow saved before their opacity opaque', () => {
    const { opacity: _scaleOpacity, ...savedScale } = geoIndicationsState.scale;
    const { opacity: _orientationOpacity, ...savedOrientation } =
      geoIndicationsState.orientation;
    geoIndicationsActions.setScaleOpacity(30);
    geoIndicationsActions.setOrientationOpacity(30);
    geoIndicationsActions.reset();

    geoIndicationsActions.setState({
      scale: savedScale as typeof geoIndicationsState.scale,
      orientation: savedOrientation as typeof geoIndicationsState.orientation
    });

    expect(geoIndicationsState.scale.opacity).toBe(100);
    expect(geoIndicationsState.orientation.opacity).toBe(100);
  });

  it('should keep a restored scale line thickness within its limits', () => {
    geoIndicationsActions.setState({
      scale: { ...geoIndicationsState.scale, lineWidth: 40 }
    });

    expect(geoIndicationsState.scale.lineWidth).toBe(8);
  });

  it('promotes default sizes to the A3 profile on first enable', () => {
    formatActions.setModel(PageModel.A3_LANDSCAPE);

    geoIndicationsActions.toggleScale();
    geoIndicationsActions.toggleOrientation();
    geoIndicationsActions.toggleInsetMap();

    expect(geoIndicationsState.scale.fontSize).toBe(10);
    expect(geoIndicationsState.orientation.size).toBe(12);
    expect(geoIndicationsState.insetMap.size).toBe(130);
  });

  it('resolves default sizes from the current custom format instead of the previous preset', () => {
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);
    formatActions.setMode(FormatMode.CUSTOM);
    formatActions.setSize(800, 800);

    geoIndicationsActions.toggleScale();
    geoIndicationsActions.toggleInsetMap();

    expect(geoIndicationsState.scale.fontSize).toBe(10);
    expect(geoIndicationsState.insetMap.size).toBe(130);
  });

  it('keeps custom geo-indication sizes when they were already changed', () => {
    geoIndicationsActions.setScaleFontSize(18);
    geoIndicationsActions.setOrientationSize(18);
    geoIndicationsActions.setInsetMapSize(320);
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);

    geoIndicationsActions.toggleScale();
    geoIndicationsActions.toggleOrientation();
    geoIndicationsActions.toggleInsetMap();

    expect(geoIndicationsState.scale.fontSize).toBe(18);
    expect(geoIndicationsState.orientation.size).toBe(18);
    expect(geoIndicationsState.insetMap.size).toBe(320);
  });

  it('restores a format-derived scale font size outside the preset list', () => {
    geoIndicationsActions.setState({
      scale: { ...geoIndicationsState.scale, fontSize: 11 }
    });

    expect(geoIndicationsState.scale.fontSize).toBe(11);
  });

  it('converts scale distance when the unit changes', () => {
    geoIndicationsActions.setState({
      scale: {
        ...geoIndicationsState.scale,
        distance: 100,
        units: DistanceUnit.KILOMETERS
      }
    });

    geoIndicationsActions.setScaleUnits(DistanceUnit.MILES);

    expect(geoIndicationsState.scale.units).toBe(DistanceUnit.MILES);
    expect(geoIndicationsState.scale.distance).toBe(62);

    geoIndicationsActions.setScaleUnits(DistanceUnit.KILOMETERS);

    expect(geoIndicationsState.scale.units).toBe(DistanceUnit.KILOMETERS);
    expect(geoIndicationsState.scale.distance).toBe(100);
  });

  it('clamps scale distance to the current renderable max when map context is available', () => {
    mapInstanceStore.setMapInstance(createScaleMap(100) as never);

    geoIndicationsActions.setScaleDistance(500);

    expect(geoIndicationsState.scale.distance).toBe(100);
  });

  it('clamps converted scale distance against the current renderable max when the unit changes', () => {
    mapInstanceStore.setMapInstance(createScaleMap(100) as never);
    geoIndicationsActions.setState({
      scale: {
        ...geoIndicationsState.scale,
        distance: 100,
        units: DistanceUnit.KILOMETERS
      }
    });

    geoIndicationsActions.setScaleUnits(DistanceUnit.MILES);

    expect(geoIndicationsState.scale.units).toBe(DistanceUnit.MILES);
    expect(geoIndicationsState.scale.distance).toBe(50);
  });

  it('uses Deck bounds before a stale MapLibre instance outside tiled basemaps', () => {
    mapInstanceStore.setMapInstance(createScaleMap(1_000_000) as never);
    mapInstanceStore.setDeckInstance({ setProps: vi.fn() } as never);
    mapInstanceStore.setMapLoaded(true);
    injectProjectionContext(() => ({
      referenceBbox: [-180, -90, 180, 90],
      canvasSize: { width: 800, height: 600 },
      fitPaddingPx: 0,
      isProjectedCoordinates: false
    }));

    geoIndicationsActions.setScaleDistance(5000);

    expect(geoIndicationsState.scale.distance).toBe(5000);
  });

  it('clamps scale distance to the meaningful max for the active unit', () => {
    geoIndicationsActions.setScaleDistance(Number.MAX_SAFE_INTEGER);

    expect(geoIndicationsState.scale.distance).toBe(
      MAX_SCALE_DISTANCE_BY_UNIT[DistanceUnit.KILOMETERS]
    );

    geoIndicationsActions.setScaleUnits(DistanceUnit.MILES);
    geoIndicationsActions.setScaleDistance(Number.MAX_SAFE_INTEGER);

    expect(geoIndicationsState.scale.distance).toBe(
      MAX_SCALE_DISTANCE_BY_UNIT[DistanceUnit.MILES]
    );
  });

  it('normalizes restored scale distance against the active unit max', () => {
    geoIndicationsActions.setState({
      scale: {
        ...geoIndicationsState.scale,
        distance: 500_000_000_000_000,
        units: DistanceUnit.KILOMETERS
      }
    });

    expect(geoIndicationsState.scale.distance).toBe(
      MAX_SCALE_DISTANCE_BY_UNIT[DistanceUnit.KILOMETERS]
    );
  });
});
