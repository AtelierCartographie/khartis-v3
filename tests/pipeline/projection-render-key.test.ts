import { describe, expect, it } from 'vitest';
import { buildProjectionRenderKey } from '$lib/features/step-toolbar/tools/projections/projection-render-key';
import type { ProjectionState } from '$lib/features/step-toolbar/tools/projections/projections.types';

function createProjectionState(
  overrides: Partial<ProjectionState> = {}
): ProjectionState {
  return {
    selected: 'mercator',
    viewMode: 'list',
    longitude: 0,
    latitude: 0,
    rotation: 0,
    overrideActive: false,
    ...overrides
  } as ProjectionState;
}

describe('buildProjectionRenderKey', () => {
  it('changes when the selected preset changes inside the same map family', () => {
    const mercator = createProjectionState({
      selected: 'mercator',
      overrideActive: true
    });
    const orthographic = createProjectionState({
      selected: 'orthographic',
      overrideActive: true
    });

    expect(buildProjectionRenderKey(mercator)).not.toBe(
      buildProjectionRenderKey(orthographic)
    );
  });

  it('changes when a custom projection code becomes active', () => {
    const preset = createProjectionState({
      selected: 'mercator',
      overrideActive: true
    });
    const custom = createProjectionState({
      selected: 'mercator',
      customCode: '+proj=lcc +lat_1=44 +lat_2=49 +lat_0=46.5 +lon_0=3',
      overrideActive: true
    });

    expect(buildProjectionRenderKey(preset)).not.toBe(
      buildProjectionRenderKey(custom)
    );
  });

  it('ignores suggestion payloads that do not affect rendering', () => {
    const baseState = createProjectionState({
      selected: 'natural-earth',
      overrideActive: true
    });

    const withSuggestions = createProjectionState({
      ...baseState,
      suggestions: {
        national: [],
        generic: [
          {
            id: 'geoNaturalEarth1',
            label: 'Natural Earth',
            d3Config: { projection: 'geoNaturalEarth1' }
          }
        ]
      }
    });

    expect(buildProjectionRenderKey(baseState)).toBe(
      buildProjectionRenderKey(withSuggestions)
    );
  });

  it('changes when an override moves from auto to manual with the same projection', () => {
    const autoState = createProjectionState({
      selected: 'mercator',
      overrideActive: true,
      overrideSource: 'auto'
    });
    const manualState = createProjectionState({
      selected: 'mercator',
      overrideActive: true,
      overrideSource: 'manual'
    });

    expect(buildProjectionRenderKey(autoState)).not.toBe(
      buildProjectionRenderKey(manualState)
    );
  });
});
