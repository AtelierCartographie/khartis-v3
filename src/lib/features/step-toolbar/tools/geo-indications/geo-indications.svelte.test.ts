import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DistanceUnit } from '$lib/features/commons/constants/ui.constants';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
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

describe('geo-indications tool', () => {
  beforeEach(() => {
    mocks.resetPagePan.mockClear();
    geoIndicationsActions.reset();
    mapInstanceStore.reset();
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

  it('exposes longitude and latitude controls for the inset map centering', async () => {
    render(GeoIndications);

    const insetSwitch = screen.getByRole('switch', { name: m.geo_inset_map() });

    await fireEvent.click(insetSwitch);

    expect(
      await screen.findByRole('spinbutton', {
        name: m.geo_inset_map_center_longitude()
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', {
        name: m.geo_inset_map_center_latitude()
      })
    ).toBeInTheDocument();
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
