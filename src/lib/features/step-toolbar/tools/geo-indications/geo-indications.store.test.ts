import { beforeEach, describe, expect, it } from 'vitest';
import {
  DistanceUnit,
  InsetMapType,
  OrientationIndicatorStyle,
  ScaleForm
} from '$lib/features/commons/constants/ui.constants';
import {
  geoIndicationsActions,
  geoIndicationsState
} from './geo-indications.store.svelte';

describe('geo-indications defaults', () => {
  beforeEach(() => {
    geoIndicationsActions.reset();
  });

  it('uses dark text colors for scale and orientation indicators by default', () => {
    expect(geoIndicationsState.scale.color).toEqual({
      hue: 0,
      saturation: 0,
      lightness: 0
    });
    expect(geoIndicationsState.orientation.color).toEqual({
      hue: 0,
      saturation: 0,
      lightness: 0
    });
  });

  it('keeps all geo indications disabled by default', () => {
    expect(geoIndicationsState.visible).toBe(true);
    expect(geoIndicationsState.scale.enabled).toBe(false);
    expect(geoIndicationsState.orientation.enabled).toBe(false);
    expect(geoIndicationsState.insetMap.enabled).toBe(false);
  });

  it('supports global geo indications visibility toggle', () => {
    geoIndicationsActions.setVisibility(false);
    expect(geoIndicationsState.visible).toBe(false);

    geoIndicationsActions.setVisibility(true);
    expect(geoIndicationsState.visible).toBe(true);
  });

  it('updates and clamps scale settings', () => {
    geoIndicationsActions.toggleScale();
    geoIndicationsActions.setScaleForm(ScaleForm.BOX);
    geoIndicationsActions.setScaleUnits(DistanceUnit.MILES);
    geoIndicationsActions.setScaleDistance(1250);

    expect(geoIndicationsState.scale.enabled).toBe(true);
    expect(geoIndicationsState.scale.form).toBe(ScaleForm.BOX);
    expect(geoIndicationsState.scale.units).toBe(DistanceUnit.MILES);
    expect(geoIndicationsState.scale.distance).toBe(1250);

    geoIndicationsActions.decrementScaleDistance(1500);
    expect(geoIndicationsState.scale.distance).toBe(0);

    geoIndicationsActions.incrementScaleDistance(250);
    expect(geoIndicationsState.scale.distance).toBe(250);
  });

  it('updates orientation style and clamps orientation size', () => {
    geoIndicationsActions.toggleOrientation();
    geoIndicationsActions.setOrientationStyle(
      OrientationIndicatorStyle.COMPASS
    );
    geoIndicationsActions.setOrientationSize(999);

    expect(geoIndicationsState.orientation.enabled).toBe(true);
    expect(geoIndicationsState.orientation.style).toBe(
      OrientationIndicatorStyle.COMPASS
    );
    expect(geoIndicationsState.orientation.size).toBe(30);

    geoIndicationsActions.setOrientationSize(1);
    expect(geoIndicationsState.orientation.size).toBe(5);
  });

  it('updates inset map settings with expected bounds', () => {
    geoIndicationsActions.toggleInsetMap();
    geoIndicationsActions.setInsetMapType(InsetMapType.PLANISPHERE);
    geoIndicationsActions.setInsetMapSize(400);
    geoIndicationsActions.setInsetMapZoom(110);
    geoIndicationsActions.setInsetMapCenterLongitude(220);
    geoIndicationsActions.setInsetMapCenterLatitude(-120);
    geoIndicationsActions.setInsetMapUseBasemapColors(true);

    expect(geoIndicationsState.insetMap.enabled).toBe(true);
    expect(geoIndicationsState.insetMap.type).toBe(InsetMapType.PLANISPHERE);
    expect(geoIndicationsState.insetMap.size).toBe(210);
    expect(geoIndicationsState.insetMap.zoom).toBe(100);
    expect(geoIndicationsState.insetMap.centerLongitude).toBe(180);
    expect(geoIndicationsState.insetMap.centerLatitude).toBe(-90);
    expect(geoIndicationsState.insetMap.useBasemapColors).toBe(true);
  });

  it('starts with null drag positions for all elements', () => {
    expect(geoIndicationsState.scale.dragPosition).toBeNull();
    expect(geoIndicationsState.orientation.dragPosition).toBeNull();
    expect(geoIndicationsState.insetMap.dragPosition).toBeNull();
  });

  it('sets and clears scale drag position', () => {
    geoIndicationsActions.setScaleDragPosition({ x: 100, y: 200 });
    expect(geoIndicationsState.scale.dragPosition).toEqual({ x: 100, y: 200 });

    geoIndicationsActions.setScaleDragPosition(null);
    expect(geoIndicationsState.scale.dragPosition).toBeNull();
  });

  it('sets and clears orientation drag position', () => {
    geoIndicationsActions.setOrientationDragPosition({ x: 50, y: 75 });
    expect(geoIndicationsState.orientation.dragPosition).toEqual({
      x: 50,
      y: 75
    });

    geoIndicationsActions.setOrientationDragPosition(null);
    expect(geoIndicationsState.orientation.dragPosition).toBeNull();
  });

  it('sets and clears inset map drag position', () => {
    geoIndicationsActions.setInsetMapDragPosition({ x: 300, y: 150 });
    expect(geoIndicationsState.insetMap.dragPosition).toEqual({
      x: 300,
      y: 150
    });

    geoIndicationsActions.setInsetMapDragPosition(null);
    expect(geoIndicationsState.insetMap.dragPosition).toBeNull();
  });

  it('clears all drag positions on reset', () => {
    geoIndicationsActions.setScaleDragPosition({ x: 10, y: 20 });
    geoIndicationsActions.setOrientationDragPosition({ x: 30, y: 40 });
    geoIndicationsActions.setInsetMapDragPosition({ x: 50, y: 60 });

    geoIndicationsActions.reset();

    expect(geoIndicationsState.scale.dragPosition).toBeNull();
    expect(geoIndicationsState.orientation.dragPosition).toBeNull();
    expect(geoIndicationsState.insetMap.dragPosition).toBeNull();
  });

  it('preserves drag positions through setState when not specified', () => {
    geoIndicationsActions.setScaleDragPosition({ x: 42, y: 84 });
    geoIndicationsActions.setState({ visible: false });
    expect(geoIndicationsState.scale.dragPosition).toEqual({ x: 42, y: 84 });
  });

  it('supports color updates from hex values', () => {
    geoIndicationsActions.setScaleColorFromHex('#ff0000');
    geoIndicationsActions.setOrientationColorFromHex('#00ff00');
    geoIndicationsActions.setInsetMapSeaColorFromHex('#0000ff');

    expect(geoIndicationsState.scale.color.hue).toBe(0);
    expect(geoIndicationsState.orientation.color.hue).toBe(120);
    expect(geoIndicationsState.insetMap.seaColor.hue).toBe(240);
  });

  it('ignores invalid numeric values for setters', () => {
    const initialOrientation = geoIndicationsState.orientation.size;
    const initialInsetSize = geoIndicationsState.insetMap.size;
    const initialDistance = geoIndicationsState.scale.distance;

    geoIndicationsActions.setOrientationSize(Number.NaN);
    geoIndicationsActions.setInsetMapSize(Number.NaN);
    geoIndicationsActions.setScaleDistance(Number.NaN);

    expect(geoIndicationsState.orientation.size).toBe(initialOrientation);
    expect(geoIndicationsState.insetMap.size).toBe(initialInsetSize);
    expect(geoIndicationsState.scale.distance).toBe(initialDistance);
  });

  it('sanitizes restored partial state through setState', () => {
    geoIndicationsActions.setState({
      orientation: {
        enabled: true,
        style: OrientationIndicatorStyle.ARROW,
        size: 999,
        color: {
          hue: 999,
          saturation: -10,
          lightness: 999
        },
        dragPosition: null
      },
      insetMap: {
        enabled: true,
        type: InsetMapType.GLOBE,
        size: 1,
        windowColor: {
          hue: 0,
          saturation: 0,
          lightness: 0
        },
        continentColor: {
          hue: 120,
          saturation: 20,
          lightness: 80
        },
        seaColor: {
          hue: 210,
          saturation: 50,
          lightness: 85
        },
        useBasemapColors: false,
        zoom: 500,
        centerLongitude: -500,
        centerLatitude: 500,
        dragPosition: null
      }
    });

    expect(geoIndicationsState.orientation.size).toBe(30);
    expect(geoIndicationsState.orientation.color.hue).toBe(360);
    expect(geoIndicationsState.orientation.color.saturation).toBe(0);
    expect(geoIndicationsState.orientation.color.lightness).toBe(100);
    expect(geoIndicationsState.insetMap.size).toBe(20);
    expect(geoIndicationsState.insetMap.zoom).toBe(100);
    expect(geoIndicationsState.insetMap.centerLongitude).toBe(-180);
    expect(geoIndicationsState.insetMap.centerLatitude).toBe(90);
  });
});
