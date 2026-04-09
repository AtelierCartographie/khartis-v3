import { describe, expect, it, vi } from 'vitest';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { syncProjectOSMBasemap } from './osm-basemap-sync';

function createOSMBasemap(file: string): BasemapMetadata {
  return {
    file,
    title_fr: 'Fond OSM',
    title_en: 'OSM basemap',
    source: 'OpenStreetMap',
    date: '2026-04-09',
    bbox: [-180, -85, 180, 85],
    proj_source: 'EPSG:3857',
    proj_to: {
      type: 'simple'
    },
    layers: [],
    isCustom: true
  };
}

describe('syncProjectOSMBasemap', () => {
  it('restores the project OSM basemap from project data when the catalog copy is missing', () => {
    const osmBasemap = createOSMBasemap('osm_standard_123');
    const basemapLookup = {
      getBasemapById: vi.fn(() => undefined),
      addCustomBasemap: vi.fn()
    };
    const osmState = {
      activeOSMBasemap: null,
      setOSMBasemap: vi.fn(),
      clear: vi.fn()
    };

    syncProjectOSMBasemap(
      {
        type: 'osm',
        id: osmBasemap.file,
        data: { ...osmBasemap }
      },
      basemapLookup,
      osmState
    );

    expect(basemapLookup.addCustomBasemap).toHaveBeenCalledWith(osmBasemap);
    expect(osmState.setOSMBasemap).toHaveBeenCalledWith(osmBasemap);
    expect(osmState.clear).not.toHaveBeenCalled();
  });

  it('reuses the catalog OSM basemap when it is already available', () => {
    const osmBasemap = createOSMBasemap('osm_standard_456');
    const basemapLookup = {
      getBasemapById: vi.fn(() => osmBasemap),
      addCustomBasemap: vi.fn()
    };
    const osmState = {
      activeOSMBasemap: null,
      setOSMBasemap: vi.fn(),
      clear: vi.fn()
    };

    syncProjectOSMBasemap(
      {
        type: 'osm',
        id: osmBasemap.file,
        data: undefined
      },
      basemapLookup,
      osmState
    );

    expect(osmState.setOSMBasemap).toHaveBeenCalledWith(osmBasemap);
    expect(basemapLookup.addCustomBasemap).not.toHaveBeenCalled();
    expect(osmState.clear).not.toHaveBeenCalled();
  });

  it('clears a stale OSM state when the current project basemap is no longer OSM', () => {
    const basemapLookup = {
      getBasemapById: vi.fn(),
      addCustomBasemap: vi.fn()
    };
    const osmState = {
      activeOSMBasemap: createOSMBasemap('osm_standard_789'),
      setOSMBasemap: vi.fn(),
      clear: vi.fn()
    };

    syncProjectOSMBasemap(
      {
        type: 'catalog',
        id: 'france-region-2025-high'
      },
      basemapLookup,
      osmState
    );

    expect(osmState.clear).toHaveBeenCalledOnce();
    expect(osmState.setOSMBasemap).not.toHaveBeenCalled();
    expect(basemapLookup.addCustomBasemap).not.toHaveBeenCalled();
  });
});
