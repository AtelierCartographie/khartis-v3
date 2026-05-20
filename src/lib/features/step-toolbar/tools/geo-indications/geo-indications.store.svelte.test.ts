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
import { hexToHsl } from '$lib/features/commons/utils/color-utils';
import { formatActions } from '../format/format.store.svelte';

const mocks = vi.hoisted(() => ({
  resetPagePan: vi.fn()
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
  globalActions: {
    resetPagePan: mocks.resetPagePan
  }
}));

import {
  geoIndicationsActions,
  geoIndicationsState
} from './geo-indications.store.svelte';
import { MAX_SCALE_DISTANCE_BY_UNIT } from './geo-indications.utils';

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
    mocks.resetPagePan.mockClear();
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

  it('starts the inset map from explicit inset colors', () => {
    expect(geoIndicationsState.insetMap.useBasemapColors).toBe(false);
    expect(geoIndicationsState.insetMap.windowColor).toEqual(
      hexToHsl('#ffffff')
    );
    expect(geoIndicationsState.insetMap.continentColor).toEqual(
      hexToHsl('#d9d9d9')
    );
    expect(geoIndicationsState.insetMap.seaColor).toEqual(hexToHsl('#d0e2ff'));
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

    geoIndicationsActions.setInsetMapType(InsetMapType.PLANISPHERE);
    geoIndicationsActions.setInsetMapUseBasemapColors(true);

    expect(geoIndicationsState.insetMap.type).toBe(InsetMapType.GLOBE);
    expect(geoIndicationsState.insetMap.useBasemapColors).toBe(false);
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

  it('recenters the page when the last geo indication is disabled', () => {
    geoIndicationsActions.toggleScale();
    mocks.resetPagePan.mockClear();

    geoIndicationsActions.toggleScale();

    expect(geoIndicationsState.scale.enabled).toBe(false);
    expect(mocks.resetPagePan).toHaveBeenCalledOnce();
  });

  it('keeps the page offset while another geo indication remains enabled', () => {
    geoIndicationsActions.toggleScale();
    geoIndicationsActions.toggleOrientation();
    mocks.resetPagePan.mockClear();

    geoIndicationsActions.toggleScale();

    expect(geoIndicationsState.scale.enabled).toBe(false);
    expect(geoIndicationsState.orientation.enabled).toBe(true);
    expect(mocks.resetPagePan).not.toHaveBeenCalled();

    geoIndicationsActions.toggleOrientation();

    expect(mocks.resetPagePan).toHaveBeenCalledOnce();
  });

  it('recenters the page when setState disables all geo indications', () => {
    geoIndicationsActions.toggleScale();
    geoIndicationsActions.toggleInsetMap();
    mocks.resetPagePan.mockClear();

    geoIndicationsActions.setState({
      scale: {
        ...geoIndicationsState.scale,
        enabled: false
      },
      insetMap: {
        ...geoIndicationsState.insetMap,
        enabled: false
      }
    });

    expect(mocks.resetPagePan).toHaveBeenCalledOnce();
  });
});
