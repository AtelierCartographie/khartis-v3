import { afterEach, describe, expect, it } from 'vitest';
import type { BasemapMetadata } from '../types/basemap.types';
import { osmBasemapStore } from './osm-basemap.store.svelte';

function createOSMBasemap(file: string): BasemapMetadata {
  return {
    file,
    title_fr: 'Fond OSM',
    title_en: 'OSM basemap',
    source: 'OpenStreetMap',
    date: '2026-08-28',
    bbox: [-180, -85, 180, 85],
    proj_source: 'EPSG:3857',
    proj_to: { type: 'simple' },
    layers: [],
    isCustom: true
  };
}

afterEach(() => {
  osmBasemapStore.reset();
});

describe('osmBasemapStore user disable state', () => {
  it('keeps an OSM basemap disabled until it is explicitly reactivated', () => {
    const basemap = createOSMBasemap('osm_standard_test');
    osmBasemapStore.setOSMBasemap(basemap);

    osmBasemapStore.disable();

    expect(osmBasemapStore.activeOSMBasemap).toBeNull();
    expect(osmBasemapStore.isDisabledByUser).toBe(true);

    osmBasemapStore.setOSMBasemap(basemap);

    expect(osmBasemapStore.activeOSMBasemap).toStrictEqual(basemap);
    expect(osmBasemapStore.isDisabledByUser).toBe(false);
  });

  it('restores an explicitly disabled serialized OSM state', () => {
    osmBasemapStore.restoreFromSerialized(null);

    expect(osmBasemapStore.activeOSMBasemap).toBeNull();
    expect(osmBasemapStore.isDisabledByUser).toBe(true);

    osmBasemapStore.reset();

    expect(osmBasemapStore.isDisabledByUser).toBe(false);
  });
});
