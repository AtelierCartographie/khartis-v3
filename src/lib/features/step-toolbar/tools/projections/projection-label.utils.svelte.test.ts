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

  it('names the basemap projection, not an automatic override left by a previous basemap', () => {
    expect(
      resolveCurrentProjectionDisplay(
        createState({
          selected: 'composite:FRANCE_DOM_TOM',
          overrideSource: 'auto'
        }),
        { type: 'simple', proj4: '+proj=eqearth' }
      ).name
    ).toBe('Equal Earth');
  });

  it('names a preset by the official name and EPSG code it carries', () => {
    const display = resolveCurrentProjectionDisplay(
      createState({ overrideActive: false, overrideSource: undefined }),
      { type: 'composite', preset: 'BRESIL_ALBERS' },
      {
        BRESIL_ALBERS: {
          name_fr: 'SIRGAS 2000 / Brazil Albers',
          name_en: 'SIRGAS 2000 / Brazil Albers',
          epsg: '10857',
          entries: []
        }
      }
    );

    expect(display.name).toBe('SIRGAS 2000 / Brazil Albers');
    expect(display.description).toContain('EPSG:10857');
  });

  it('should name the suggestion matching the EPSG code when an imported file is drawn in its own CRS', () => {
    const lambert93 = {
      id: 'national-fr',
      name: 'lambert93',
      type: 'national' as const,
      epsg: '2154',
      proj4String: '+proj=lcc',
      d3Config: null,
      bbox: [2, 43, 4, 44] as [number, number, number, number]
    };
    const display = resolveCurrentProjectionDisplay(
      createState({
        overrideActive: false,
        overrideSource: undefined,
        suggestions: { national: [lambert93], generic: [] }
      }),
      { type: 'identity', nativeEpsg: '2154' }
    );

    expect(display.name).toBe('lambert93');
    expect(display.description).toContain('EPSG:2154');
  });

  it('should keep the EPSG code of the file when no suggestion matches it', () => {
    const display = resolveCurrentProjectionDisplay(
      createState({ overrideActive: false, overrideSource: undefined }),
      { type: 'identity', nativeEpsg: '32620' }
    );

    expect(display.name).toBe("Projection d'origine du fond");
    expect(display.description).toBe('EPSG:32620');
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
