import { describe, expect, it } from 'vitest';
import { buildProjectionRenderKey } from '$lib/features/step-toolbar/tools/projections/projection-render-key';
import type { ProjectionState } from '$lib/features/step-toolbar/types/projections.types';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';

const DEFAULT_STATE: ProjectionState = {
  selected: 'mercator',
  viewMode: ViewMode.LIST,
  longitude: 0,
  latitude: 0,
  rotation: 0
};

describe('buildProjectionRenderKey', () => {
  it('returns a stable key for default mercator state', () => {
    const key = buildProjectionRenderKey(DEFAULT_STATE);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('changes when selected projection changes', () => {
    const key1 = buildProjectionRenderKey(DEFAULT_STATE);
    const key2 = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      selected: 'robinson'
    });
    expect(key1).not.toBe(key2);
  });

  it('changes when custom code changes', () => {
    const key1 = buildProjectionRenderKey(DEFAULT_STATE);
    const key2 = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      customCode: '+proj=robin +datum=WGS84'
    });
    expect(key1).not.toBe(key2);
  });

  it('changes when suggestion d3 config changes', () => {
    const key1 = buildProjectionRenderKey(DEFAULT_STATE);
    const key2 = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      suggestionD3Config: { projection: 'geoRobinson', rotate: [30, 0] }
    });
    expect(key1).not.toBe(key2);
  });

  it('changes when center changes', () => {
    const key1 = buildProjectionRenderKey(DEFAULT_STATE);
    const key2 = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      center: [10, 20]
    });
    expect(key1).not.toBe(key2);
  });

  it('uses longitude/latitude as fallback when center is absent', () => {
    const keyWithCenter = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      center: [10, 20]
    });
    const keyWithLonLat = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      longitude: 10,
      latitude: 20
    });
    expect(keyWithCenter).toBe(keyWithLonLat);
  });

  it('changes when rotation changes', () => {
    const key1 = buildProjectionRenderKey(DEFAULT_STATE);
    const key2 = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      rotation: 45
    });
    expect(key1).not.toBe(key2);
  });

  it('changes when override active toggles', () => {
    const key1 = buildProjectionRenderKey(DEFAULT_STATE);
    const key2 = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      overrideActive: true,
      overrideSource: 'manual'
    });
    expect(key1).not.toBe(key2);
  });

  it('ignores suggestions payload and view-only state', () => {
    const key1 = buildProjectionRenderKey(DEFAULT_STATE);
    const key2 = buildProjectionRenderKey({
      ...DEFAULT_STATE,
      suggestions: {
        national: [],
        generic: []
      },
      activeSuggestionId: 'test',
      viewMode: ViewMode.GRID
    });
    expect(key1).toBe(key2);
  });

  it('is stable for identical states', () => {
    const state: ProjectionState = {
      selected: 'natural-earth',
      overrideActive: true,
      overrideSource: 'manual',
      viewMode: ViewMode.LIST,
      longitude: 15,
      latitude: 48,
      rotation: 30,
      customCode: undefined,
      suggestionD3Config: undefined
    };
    expect(buildProjectionRenderKey(state)).toBe(
      buildProjectionRenderKey(state)
    );
  });
});
