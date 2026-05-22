import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DistanceUnit } from '$lib/features/commons/constants/ui.constants';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
import { projectionStore } from '$lib/features/map/stores/projection.store.svelte';
import * as m from '$lib/paraglide/messages';

const mocks = vi.hoisted(() => ({
  resetPagePan: vi.fn()
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
  globalActions: {
    resetPagePan: mocks.resetPagePan
  }
}));

import GeoIndications from './geo-indications.svelte';
import {
  geoIndicationsActions,
  geoIndicationsState
} from './geo-indications.store.svelte';
import { MAX_SCALE_DISTANCE_BY_UNIT } from './geo-indications.utils';

function createScaleMap(
  widthPerLongitudeDegree: number,
  bounds = { north: 20, south: -20, east: 30, west: -30 }
) {
  return {
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 2,
    getBounds: () => ({
      getNorth: () => bounds.north,
      getSouth: () => bounds.south,
      getEast: () => bounds.east,
      getWest: () => bounds.west
    }),
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

describe('geo-indications tool', () => {
  beforeEach(() => {
    mocks.resetPagePan.mockClear();
    geoIndicationsActions.reset();
    basemapStyleStore.reset();
    mapInstanceStore.reset();
    projectionStore.reset();
  });

  it('renders section toggles', () => {
    render(GeoIndications);

    expect(
      screen.getByRole('switch', { name: m.geo_scale() })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: m.geo_orientation() })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: m.geo_inset_map() })
    ).toBeInTheDocument();
  });

  it('updates geo indications state when section toggles are changed', async () => {
    render(GeoIndications);

    const scaleSwitch = screen.getByRole('switch', { name: m.geo_scale() });

    expect(geoIndicationsState.scale.enabled).toBe(false);

    await fireEvent.click(scaleSwitch);

    expect(geoIndicationsState.scale.enabled).toBe(true);
    expect(await screen.findByText(m.geo_style())).toBeInTheDocument();
    expect(screen.getByText(m.color())).toBeInTheDocument();
  });

  it('keeps the scale font-size select synchronized with stored state', async () => {
    geoIndicationsActions.setState({
      scale: {
        ...geoIndicationsState.scale,
        enabled: true,
        fontSize: 16
      }
    });

    render(GeoIndications);

    const fontSizeSelect = screen.getAllByRole('combobox').at(-1) as
      | HTMLSelectElement
      | undefined;

    expect(fontSizeSelect).toBeDefined();
    expect(fontSizeSelect?.value).toBe('16');
  });

  it('updates the scale distance max when the unit changes', async () => {
    render(GeoIndications);

    const scaleSwitch = screen.getByRole('switch', { name: m.geo_scale() });

    await fireEvent.click(scaleSwitch);

    const distanceInput = await screen.findByRole('spinbutton', {
      name: m.geo_distance()
    });

    expect(distanceInput).toHaveAttribute(
      'max',
      String(MAX_SCALE_DISTANCE_BY_UNIT[DistanceUnit.KILOMETERS])
    );

    await fireEvent.click(screen.getByRole('radio', { name: m.geo_miles() }));

    expect(distanceInput).toHaveAttribute(
      'max',
      String(MAX_SCALE_DISTANCE_BY_UNIT[DistanceUnit.MILES])
    );
  });

  it('shows the current renderable max distance in the scale helper text', async () => {
    mapInstanceStore.setMapInstance(createScaleMap(100) as never);

    render(GeoIndications);

    await fireEvent.click(screen.getByRole('switch', { name: m.geo_scale() }));

    const distanceInput = await screen.findByRole('spinbutton', {
      name: m.geo_distance()
    });

    expect(distanceInput).toHaveAttribute('max', '100');
    expect(
      screen.getByText(
        m.geo_scale_max_distance_current_view({
          distance: '100',
          unit: 'km'
        })
      )
    ).toBeInTheDocument();
  });

  it('clamps a huge distance entered from the UI to the current renderable max', async () => {
    mapInstanceStore.setMapInstance(createScaleMap(100) as never);

    render(GeoIndications);

    await fireEvent.click(screen.getByRole('switch', { name: m.geo_scale() }));

    const distanceInput = await screen.findByRole('spinbutton', {
      name: m.geo_distance()
    });

    await fireEvent.change(distanceInput, {
      target: { value: '500000000000000' }
    });

    expect(geoIndicationsState.scale.distance).toBe(100);
  });

  it('disables the scale section while a tiled basemap is active', async () => {
    basemapStyleStore.setStyle(BasemapStyle.FRANCE_COULEURS);

    render(GeoIndications);

    const scaleSwitch = screen.getByRole('switch', { name: m.geo_scale() });

    expect(scaleSwitch).toBeDisabled();
    expect(
      screen.getByText(m.geo_scale_unavailable_tiled_basemap())
    ).toBeInTheDocument();

    await fireEvent.click(scaleSwitch);

    expect(geoIndicationsState.scale.enabled).toBe(false);
  });

  it('states that the scale is valid at the map center', async () => {
    render(GeoIndications);

    await fireEvent.click(screen.getByRole('switch', { name: m.geo_scale() }));

    expect(
      await screen.findByText(m.geo_scale_valid_at_map_center())
    ).toBeInTheDocument();
  });

  it('removes planisphere, manual centering and basemap color inheritance from the inset map controls', async () => {
    render(GeoIndications);

    const insetSwitch = screen.getByRole('switch', { name: m.geo_inset_map() });

    await fireEvent.click(insetSwitch);

    expect(
      await screen.findByRole('spinbutton', {
        name: m.geo_inset_map_size()
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.geo_inset_map_window_color())
    ).toBeInTheDocument();
    expect(
      screen.queryByText(m.geo_inset_map_planisphere())
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', {
        name: m.geo_inset_map_center_longitude()
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', {
        name: m.geo_inset_map_center_latitude()
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(m.geo_inset_map_use_basemap_colors())
    ).not.toBeInTheDocument();
  });

  it('locks the inset map when the current extent covers at least half the world', () => {
    mapInstanceStore.setMapInstance(
      createScaleMap(100, {
        north: 90,
        south: -90,
        east: 180,
        west: -180
      }) as never
    );

    render(GeoIndications);

    expect(
      screen.getByRole('switch', { name: m.geo_inset_map() })
    ).toBeDisabled();
    expect(
      screen.getByText(m.geo_inset_map_unavailable_scale())
    ).toBeInTheDocument();
  });

  it('checks projected inset availability from geographic bounds', () => {
    mapInstanceStore.setMapInstance(
      createScaleMap(100, {
        north: 60000,
        south: 0,
        east: 30000,
        west: -30000
      }) as never
    );
    projectionStore.setReferenceBbox(
      [-30000, 0, 30000, 60000],
      undefined,
      true
    );
    projectionStore.setRenderProjection({
      invert: ([x, y]: [number, number]) => [x / 1000, y / 1000]
    } as never);

    render(GeoIndications);

    expect(
      screen.getByRole('switch', { name: m.geo_inset_map() })
    ).not.toBeDisabled();
    expect(
      screen.queryByText(m.geo_inset_map_unavailable_scale())
    ).not.toBeInTheDocument();
  });

  it('updates the inset map size from the numeric input', async () => {
    render(GeoIndications);

    const insetSwitch = screen.getByRole('switch', { name: m.geo_inset_map() });

    await fireEvent.click(insetSwitch);

    const sizeInput = screen.getByRole('spinbutton', {
      name: m.geo_inset_map_size()
    });

    await fireEvent.input(sizeInput, {
      target: { value: '320' }
    });

    expect(geoIndicationsState.insetMap.size).toBe(320);
  });
});
