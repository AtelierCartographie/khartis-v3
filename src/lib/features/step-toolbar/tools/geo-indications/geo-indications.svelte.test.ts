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

  it('renders visibility and section toggles', () => {
    render(GeoIndications);

    expect(
      screen.getByRole('switch', { name: m.tool_geo_indications() })
    ).toBeInTheDocument();
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

  it('updates geo indications state when toggles are changed', async () => {
    render(GeoIndications);

    const toolSwitch = screen.getByRole('switch', {
      name: m.tool_geo_indications()
    });
    const scaleSwitch = screen.getByRole('switch', { name: m.geo_scale() });

    expect(geoIndicationsState.visible).toBe(true);
    expect(geoIndicationsState.scale.enabled).toBe(false);

    await fireEvent.click(toolSwitch);
    await fireEvent.click(scaleSwitch);

    expect(geoIndicationsState.visible).toBe(false);
    expect(geoIndicationsState.scale.enabled).toBe(true);
    expect(await screen.findByText(m.geo_style())).toBeInTheDocument();
  });
});
