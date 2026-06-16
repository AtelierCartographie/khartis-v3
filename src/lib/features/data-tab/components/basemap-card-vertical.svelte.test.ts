import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import '$lib/features/commons/stores/locale.store.svelte';
import { setLocale } from '$lib/paraglide/runtime.js';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import BasemapCardVertical from './basemap-card-vertical.svelte';

function createBasemap(
  overrides: Partial<BasemapMetadata> = {}
): BasemapMetadata {
  return {
    file: 'world',
    title_fr: 'Monde',
    title_en: 'World',
    subtitle_fr: 'Planisphere',
    subtitle_en: 'Planisphere',
    source: 'Natural Earth',
    date: '2026',
    bbox: [-180, -90, 180, 90],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'identity' },
    layers: [],
    ...overrides
  };
}

async function setTestLocale(locale: 'fr' | 'en'): Promise<void> {
  await Promise.resolve(setLocale(locale, { reload: false }));
  await tick();
}

describe('BasemapCardVertical', () => {
  afterEach(async () => {
    cleanup();
    await setTestLocale('fr');
  });

  it('updates catalogue labels when the locale changes without a reload', async () => {
    await setTestLocale('fr');

    render(BasemapCardVertical, {
      basemap: createBasemap()
    });

    expect(screen.getByText('Monde')).toBeInTheDocument();

    await setTestLocale('en');

    expect(screen.getByText('World')).toBeInTheDocument();
    expect(screen.queryByText('Monde')).not.toBeInTheDocument();
  });

  it('derives OSM card labels from the active locale instead of persisted metadata', async () => {
    await setTestLocale('fr');

    render(BasemapCardVertical, {
      basemap: createBasemap({
        file: 'osm_openstreetmap_123',
        title_fr: 'Fond de référence',
        title_en: 'Fond de référence',
        subtitle_fr: 'Ancienne description française',
        subtitle_en: 'Ancienne description française',
        source: 'Contributeurs OpenStreetMap'
      })
    });

    expect(screen.getByText('Fond de référence')).toBeInTheDocument();

    await setTestLocale('en');

    expect(screen.getByText('Reference background')).toBeInTheDocument();
    expect(screen.getByText('OpenStreetMap contributors')).toBeInTheDocument();
  });
});
