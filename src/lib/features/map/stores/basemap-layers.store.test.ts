import { beforeEach, describe, expect, it } from 'vitest';
import {
  basemapLayersStore,
  type BasemapLayerConfig
} from './basemap-layers.store.svelte';

describe('basemapLayersStore.restoreFromSerialized', () => {
  beforeEach(() => {
    basemapLayersStore.resetToDefaults();
  });

  it('keeps meridians disabled by default', () => {
    expect(basemapLayersStore.getLayer('meridiens')?.visible).toBe(false);
  });

  it('fills missing fields from defaults when restoring legacy/incomplete layers', () => {
    basemapLayersStore.restoreFromSerialized([
      {
        id: 'mers',
        visible: false,
        color: '#000000'
      } as BasemapLayerConfig,
      {
        id: 'lacs',
        visible: true,
        color: '#ffffff'
      } as BasemapLayerConfig
    ]);

    const mers = basemapLayersStore.getLayer('mers');
    const lacs = basemapLayersStore.getLayer('lacs');

    expect(mers).toEqual({
      id: 'mers',
      visible: false,
      color: '#000000',
      opacity: 100
    });

    expect(lacs).toEqual({
      id: 'lacs',
      visible: true,
      color: '#ffffff',
      thickness: 0,
      opacity: 80
    });
  });

  it('keeps known layers order and ignores unknown serialized entries', () => {
    basemapLayersStore.restoreFromSerialized([
      {
        id: 'unknown-layer',
        visible: true
      } as unknown as BasemapLayerConfig,
      {
        id: 'frontieres',
        visible: false,
        color: '#111111'
      } as BasemapLayerConfig
    ]);

    const ids = basemapLayersStore.layers.map((layer) => layer.id);
    expect(ids).toEqual([
      'mers',
      'terre',
      'lacs',
      'rivieres',
      'relief',
      'equateur',
      'meridiens',
      'frontieres',
      'villes'
    ]);

    const frontieres = basemapLayersStore.getLayer('frontieres');
    expect(frontieres?.visible).toBe(false);
    expect(frontieres?.color).toBe('#111111');
    expect(frontieres?.thickness).toBe(1);
  });
});
