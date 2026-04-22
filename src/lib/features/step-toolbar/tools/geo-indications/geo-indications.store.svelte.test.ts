import { beforeEach, describe, expect, it } from 'vitest';
import {
  DistanceUnit,
  FormatMode,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import { hexToHsl } from '$lib/features/commons/utils/color-utils';
import { formatActions } from '../format/format.store.svelte';
import {
  geoIndicationsActions,
  geoIndicationsState
} from './geo-indications.store.svelte';
import { MAX_SCALE_DISTANCE_BY_UNIT } from './utils';

function createScaleMap(widthPerLongitudeDegree: number) {
  return {
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 2,
    project: ([lng]: [number, number]) => ({
      x: lng * widthPerLongitudeDegree,
      y: 0
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
  });

  it('starts the inset map from coherent basemap colors', () => {
    expect(geoIndicationsState.insetMap.useBasemapColors).toBe(true);
    expect(geoIndicationsState.insetMap.windowColor).toEqual(
      hexToHsl('#ffffff')
    );
    expect(geoIndicationsState.insetMap.continentColor).toEqual(
      hexToHsl('#d9d9d9')
    );
    expect(geoIndicationsState.insetMap.seaColor).toEqual(hexToHsl('#d0e2ff'));
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
