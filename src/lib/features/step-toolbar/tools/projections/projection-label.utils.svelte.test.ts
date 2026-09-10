import { describe, expect, it } from 'vitest';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import type { ProjectionState } from '../../types/projections.types';
import { resolveCurrentProjectionDisplay } from './projection-label.utils';

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

describe('resolveCurrentProjectionDisplay', () => {
  it('names the reference basemap projection while no override is active', () => {
    expect(
      resolveCurrentProjectionDisplay(
        createState({ overrideActive: false, overrideSource: undefined }),
        { type: 'simple', proj4: '+proj=eqearth' }
      ).name
    ).toBe('Equal Earth');
  });

  it('names a composite basemap preset', () => {
    expect(
      resolveCurrentProjectionDisplay(
        createState({ overrideActive: false, overrideSource: undefined }),
        { type: 'composite', preset: 'FRANCE_DOM_TOM' }
      ).name
    ).toBe('France + DOM-TOM (encarts)');
  });

  it('names a suggestion restored from its d3 config alone', () => {
    expect(
      resolveCurrentProjectionDisplay(
        createState({
          activeSuggestionId: 'bertin1953',
          suggestionD3Config: { projection: 'geoBertin1953' }
        })
      ).name
    ).toBe('Bertin 1953');
  });

  it('names a catalogue projection', () => {
    expect(
      resolveCurrentProjectionDisplay(
        createState({ selected: 'peirce-quincuncial' })
      ).name
    ).toBe('Peirce quinconce (planisphère carré)');
  });

  it('falls back to the raw code for an unrecognised CRS code', () => {
    const display = resolveCurrentProjectionDisplay(
      createState({ customCode: '+proj=zzz' })
    );

    expect(display.name).toBe('Code SCR personnalisé');
    expect(display.description).toBe('+proj=zzz');
  });
});
