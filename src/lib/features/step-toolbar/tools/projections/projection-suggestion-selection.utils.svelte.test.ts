import { describe, expect, it } from 'vitest';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import type { ProjectionState } from '../../types/projections.types';
import type { ProjectionSuggestion } from './projection-suggest.service';
import { isProjectionSuggestionOrientationDefault } from './projection-suggestion-selection.utils';

function createState(
  overrides: Partial<ProjectionState> = {}
): ProjectionState {
  return {
    selected: 'mercator',
    overrideActive: true,
    overrideSource: 'manual',
    viewMode: ViewMode.LIST,
    longitude: 0,
    latitude: 0,
    rotation: 0,
    ...overrides
  };
}

function createSuggestion(
  overrides: Partial<ProjectionSuggestion> = {}
): ProjectionSuggestion {
  const baseSuggestion: ProjectionSuggestion = {
    id: 'equalearth',
    name: 'Equal Earth',
    type: 'generic',
    proj4String: null,
    d3Config: {
      projection: 'geoEqualEarth'
    },
    bbox: [-180, -90, 180, 90]
  };

  return {
    ...baseSuggestion,
    ...overrides,
    proj4String: overrides.proj4String ?? baseSuggestion.proj4String
  };
}

describe('isProjectionSuggestionOrientationDefault', () => {
  it('keeps an unmodified suggestion selected', () => {
    expect(
      isProjectionSuggestionOrientationDefault(
        createState(),
        createSuggestion()
      )
    ).toBe(true);
  });

  it('keeps a seeded D3 suggestion selected when the orientation matches its rotate config', () => {
    expect(
      isProjectionSuggestionOrientationDefault(
        createState({
          center: [12, -45],
          longitude: 12,
          latitude: -45
        }),
        createSuggestion({
          d3Config: {
            projection: 'geoAzimuthalEqualArea',
            rotate: [-12, 45]
          }
        })
      )
    ).toBe(true);
  });

  it('clears selection after a manual rotation override', () => {
    expect(
      isProjectionSuggestionOrientationDefault(
        createState({ rotation: 10 }),
        createSuggestion()
      )
    ).toBe(false);
  });

  it('clears selection after a manual center override', () => {
    expect(
      isProjectionSuggestionOrientationDefault(
        createState({ center: [2, 0], longitude: 2 }),
        createSuggestion()
      )
    ).toBe(false);
  });
});
