import { describe, expect, it } from 'vitest';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import type { ProjectionState } from '../../types/projections.types';
import { resolveCurrentProjectionDisplay } from './projection-label.utils';
import {
  createCurrentProjectionForward,
  resolveCurrentProjectionDefinition
} from './projection-definition.utils';
import { buildUserProjection } from '$lib/features/map/utils/user-projection-build.utils';
import { fitAffineTransform } from '$lib/features/commons/utils/georeference.utils';

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

  it('should name the CRS of the file when no suggestion matches it', () => {
    const display = resolveCurrentProjectionDisplay(
      createState({ overrideActive: false, overrideSource: undefined }),
      { type: 'identity', nativeEpsg: '32620' }
    );

    expect(display.name).toBe('WGS 84 / UTM zone 20N');
    expect(display.description).toMatch(/^EPSG:32620 · \+proj=utm/);
  });

  it('should keep the EPSG code of a file whose CRS is not resolved yet', () => {
    const display = resolveCurrentProjectionDisplay(
      createState({ overrideActive: false, overrideSource: undefined }),
      { type: 'identity', nativeEpsg: '2927' }
    );

    expect(display.name).toBe("Projection d'origine du fond");
    expect(display.description).toBe('EPSG:2927');
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

describe('resolveCurrentProjectionDefinition', () => {
  const definitionOf = (overrides: Partial<ProjectionState>) =>
    resolveCurrentProjectionDefinition({ state: createState(overrides) });

  it('should express a catalogue projection as a spherical PROJ string', () => {
    expect(definitionOf({ selected: 'natural-earth', longitude: 150 })).toEqual(
      {
        proj4:
          '+proj=natearth +lon_0=150 +x_0=0 +y_0=0 +R=6371000 +units=m +no_defs',
        rotation: undefined,
        notes: ['spherical']
      }
    );
  });

  it('should carry parallels, latitude of origin and standard parallel', () => {
    expect(definitionOf({ selected: 'lambert-conformal' }).proj4).toMatch(
      /\+proj=lcc \+lon_0=0 \+lat_1=\S+ \+lat_2=\S+/
    );
    expect(
      definitionOf({ selected: 'orthographic', center: [10, 45] }).proj4
    ).toMatch(/^\+proj=ortho \+lat_0=45 \+lon_0=10 /);
    expect(definitionOf({ selected: 'gall-peters' }).proj4).toMatch(
      /\+lat_ts=45 /
    );
  });

  it('should flag a tilted or rotated projection and one PROJ cannot draw', () => {
    expect(
      definitionOf({ selected: 'robinson', latitude: 20, rotation: 15 })
    ).toMatchObject({
      notes: ['spherical', 'oblique', 'rotated'],
      rotation: 15
    });
    expect(definitionOf({ selected: 'armadillo' }).notes).toEqual([
      'no-equivalent'
    ]);
  });

  it('should give back a pasted CRS, and a derived lon_0 once offset', () => {
    expect(definitionOf({ customCode: 'EPSG:2154' })).toMatchObject({
      epsg: '2154',
      proj4: expect.stringMatching(/^\+proj=lcc .*\+lon_0=3 /)
    });
    const offset = definitionOf({ customCode: 'EPSG:2154', longitude: 5 });
    expect(offset.epsg).toBeUndefined();
    expect(offset.proj4).toContain('+lon_0=8');
    expect(
      definitionOf({ customCode: 'EPSG:32631', longitude: 2 }).proj4
    ).toMatch(/^\+proj=tmerc \+lat_0=0 \+k=0\.9996 \+x_0=500000 .*\+lon_0=5$/);
  });

  it('should give Web Mercator for the tiled engine and nothing for the globe', () => {
    const state = createState();
    expect(
      resolveCurrentProjectionDefinition({ state, tiled: { globe: false } })
    ).toMatchObject({ epsg: '3857' });
    expect(
      resolveCurrentProjectionDefinition({ state, tiled: { globe: true } })
        .notes
    ).toEqual(['globe']);
  });
});

describe('createCurrentProjectionForward', () => {
  // The side-cars hold an affine map from image pixels to the coordinates of
  // the PROJ string handed out: the drawn map must be an affine image of them.
  it.each([
    ['mercator', {}],
    ['natural-earth', { longitude: 150 }],
    ['robinson', { longitude: 10 }],
    ['winkel-tripel', {}],
    ['equal-earth', { longitude: -30 }],
    ['gall-peters', {}],
    ['bonne', {}],
    ['orthographic', { center: [10, 45] }],
    ['stereographic', { center: [0, 70] }],
    ['azimuthal-equal-area', { center: [10, 52] }],
    ['albers', {}],
    ['lambert-conformal', { longitude: 3 }],
    ['transverse-mercator', { longitude: 9 }],
    ['cassini', { longitude: 9 }]
  ] as [string, Partial<ProjectionState>][])(
    'should place %s as an affine image of its CRS',
    (selected, overrides) => {
      const state = createState({ selected, ...overrides });
      const forward = createCurrentProjectionForward({ state });
      const drawn = buildUserProjection({
        selected,
        center: state.center,
        longitude: state.longitude,
        latitude: state.latitude,
        rotation: 0,
        fitBbox: [-10, 35, 30, 65],
        width: 800,
        height: 600,
        padding: 20
      });
      const samples = [];
      for (let lon = -5; lon <= 25; lon += 5) {
        for (let lat = 38; lat <= 62; lat += 6) {
          const pixel = drawn?.([lon, lat]);
          const crs = forward?.([lon, lat]);
          if (pixel && crs) {
            samples.push({ pixel: pixel as [number, number], crs });
          }
        }
      }

      expect(samples.length).toBeGreaterThan(20);
      // d3 and PROJ interpolate Robinson's table slightly differently.
      expect(fitAffineTransform(samples)?.maxResidualPx).toBeLessThan(0.1);
    }
  );

  it('should refuse a projection without CRS', () => {
    expect(
      createCurrentProjectionForward({
        state: createState({ selected: 'robinson', latitude: 30 })
      })
    ).toBeNull();
  });
});
