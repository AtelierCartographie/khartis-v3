import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import GeoIndications from './geo-indications.svelte';
import {
  geoIndicationsActions,
  geoIndicationsState
} from './geo-indications.store.svelte';

describe('geo-indications tool', () => {
  beforeEach(() => {
    geoIndicationsActions.reset();
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

  it('exposes longitude and latitude controls for the inset map centering', async () => {
    render(GeoIndications);

    const insetSwitch = screen.getByRole('switch', { name: m.geo_inset_map() });

    await fireEvent.click(insetSwitch);

    expect(
      await screen.findByText(m.geo_inset_map_center_longitude())
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.geo_inset_map_center_latitude())
    ).toBeInTheDocument();
  });
});
