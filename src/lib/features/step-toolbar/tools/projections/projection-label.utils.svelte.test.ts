import { describe, expect, it } from 'vitest';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';
import type { ProjectionState } from '../../types/projections.types';
import { resolveCurrentProjectionDisplay } from './projection-label.utils';
import { readCrsEpsg } from './native-projection.utils';
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

// DuckDB's reading of an Esri `.prj` (Washington South, US feet): no id.
const WASHINGTON_SOUTH_ESRI_PROJJSON =
  '{"$schema":"https://proj.org/schemas/v0.5/projjson.schema.json","type":"ProjectedCRS","name":"NAD83(HARN) / Washington South (ftUS)","base_crs":{"name":"NAD83(HARN)","datum":{"type":"GeodeticReferenceFrame","name":"NAD83 (High Accuracy Reference Network)","ellipsoid":{"name":"GRS 1980","semi_major_axis":6378137,"inverse_flattening":298.257222101},"id":{"authority":"EPSG","code":6152}},"coordinate_system":{"subtype":"ellipsoidal","axis":[{"name":"Longitude","abbreviation":"lon","direction":"east","unit":{"type":"AngularUnit","name":"Degree","conversion_factor":0.0174532925199433}},{"name":"Latitude","abbreviation":"lat","direction":"north","unit":{"type":"AngularUnit","name":"Degree","conversion_factor":0.0174532925199433}}]}},"conversion":{"name":"unnamed","method":{"name":"Lambert Conic Conformal (2SP)","id":{"authority":"EPSG","code":9802}},"parameters":[{"name":"Latitude of false origin","value":45.3333333333333,"unit":{"type":"AngularUnit","name":"Degree","conversion_factor":0.0174532925199433},"id":{"authority":"EPSG","code":8821}},{"name":"Longitude of false origin","value":-120.5,"unit":{"type":"AngularUnit","name":"Degree","conversion_factor":0.0174532925199433},"id":{"authority":"EPSG","code":8822}},{"name":"Latitude of 1st standard parallel","value":45.8333333333333,"unit":{"type":"AngularUnit","name":"Degree","conversion_factor":0.0174532925199433},"id":{"authority":"EPSG","code":8823}},{"name":"Latitude of 2nd standard parallel","value":47.3333333333333,"unit":{"type":"AngularUnit","name":"Degree","conversion_factor":0.0174532925199433},"id":{"authority":"EPSG","code":8824}},{"name":"Easting at false origin","value":1640416.66666667,"unit":{"type":"LinearUnit","name":"US survey foot","conversion_factor":0.304800609601219},"id":{"authority":"EPSG","code":8826}},{"name":"Northing at false origin","value":0,"unit":{"type":"LinearUnit","name":"US survey foot","conversion_factor":0.304800609601219},"id":{"authority":"EPSG","code":8827}}]},"coordinate_system":{"subtype":"Cartesian","axis":[{"name":"Easting","abbreviation":"E","direction":"east","unit":{"type":"LinearUnit","name":"US survey foot","conversion_factor":0.304800609601219,"id":{"authority":"EPSG","code":9003}}},{"name":"Northing","abbreviation":"N","direction":"north","unit":{"type":"LinearUnit","name":"US survey foot","conversion_factor":0.304800609601219,"id":{"authority":"EPSG","code":9003}}}]}}';

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

  it('should name a file CRS that carries no EPSG code', () => {
    const display = resolveCurrentProjectionDisplay(
      createState({ overrideActive: false, overrideSource: undefined }),
      { type: 'identity', nativeCrs: WASHINGTON_SOUTH_ESRI_PROJJSON }
    );

    expect(display.name).toBe('NAD83(HARN) / Washington South (ftUS)');
    expect(display.description).toContain('Lambert');
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
  it('should give the PROJJSON of a file CRS that carries no EPSG code', () => {
    const definition = resolveCurrentProjectionDefinition({
      state: createState({ overrideActive: false, overrideSource: undefined }),
      basemapProjection: {
        type: 'identity',
        nativeCrs: WASHINGTON_SOUTH_ESRI_PROJJSON
      },
      tiled: null
    });

    expect(definition.wkt).toBe(WASHINGTON_SOUTH_ESRI_PROJJSON);
    expect(definition.notes).toEqual([]);
  });

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

  it('should express a tilt as an ob_tran, flag a rotation and what PROJ cannot draw', () => {
    expect(
      definitionOf({ selected: 'robinson', latitude: 20, rotation: 15 })
    ).toMatchObject({
      proj4:
        '+proj=ob_tran +o_proj=robin +x_0=0 +y_0=0 +R=6371000 +units=m +o_lon_p=0 +o_lat_p=70 +lon_0=0 +no_defs',
      notes: ['spherical', 'rotated', 'oblique-transformation'],
      rotation: 15
    });
    expect(definitionOf({ selected: 'armadillo' }).notes).toEqual([
      'no-equivalent'
    ]);
  });

  it('should fold the central meridian of a tilted CRS into o_lon_p', () => {
    // Checked against PROJ 9: gdaltransform -t_srs <ob_tran> gives the
    // coordinates Khartis draws, to the millimetre.
    expect(
      definitionOf({ customCode: '+proj=eqearth', longitude: 30, latitude: 20 })
        .proj4
    ).toBe(
      '+proj=ob_tran +o_proj=eqearth +ellps=WGS84 +o_lon_p=0 +o_lat_p=70 +lon_0=30 +no_defs'
    );
    expect(
      definitionOf({
        customCode: '+proj=eqearth +lon_0=40',
        longitude: 10,
        latitude: 30
      }).proj4
    ).toMatch(/\+o_lon_p=-40 \+o_lat_p=60 \+lon_0=10 /);
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

function maxAffineResidual(
  state: ProjectionState,
  source: { selected?: string; customCode?: string }
): number | undefined {
  const forward = createCurrentProjectionForward({ state });
  const drawn = buildUserProjection({
    selected: source.selected ?? state.selected,
    customCode: source.customCode,
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
  return fitAffineTransform(samples)?.maxResidualPx;
}

describe('resolveCurrentProjectionDefinition on a PROJJSON CRS', () => {
  it('should move the central meridian inside the PROJJSON when the longitude changes', () => {
    const definition = resolveCurrentProjectionDefinition({
      state: createState({
        customCode: WASHINGTON_SOUTH_ESRI_PROJJSON,
        longitude: 10
      }),
      tiled: null
    });

    const crs = JSON.parse(definition.wkt ?? '{}');
    const meridian = crs.conversion.parameters.find(
      (parameter: { id: { code: number } }) => parameter.id.code === 8822
    );
    expect(meridian.value).toBe(-110.5);
    expect(crs.id).toBeUndefined();
    expect(definition.notes).toEqual([]);
  });
});

describe('readCrsEpsg', () => {
  it('should read the EPSG code of a CRS code or of a PROJJSON id', () => {
    expect(readCrsEpsg('EPSG:2927')).toBe('2927');
    expect(
      readCrsEpsg(
        '{"type":"ProjectedCRS","id":{"authority":"EPSG","code":2927}}'
      )
    ).toBe('2927');
    expect(readCrsEpsg(WASHINGTON_SOUTH_ESRI_PROJJSON)).toBeUndefined();
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

  it.each([
    ['robinson', { latitude: 30, longitude: 20 }],
    ['equal-earth', { latitude: -40 }],
    ['natural-earth', { latitude: 25, longitude: -60 }],
    ['lambert-conformal', { latitude: 15 }]
  ] as [string, Partial<ProjectionState>][])(
    'should place a tilted %s as an affine image of its ob_tran',
    (selected, overrides) => {
      const state = createState({ selected, ...overrides });
      expect(resolveCurrentProjectionDefinition({ state }).notes).toContain(
        'oblique-transformation'
      );
      expect(maxAffineResidual(state, { selected })).toBeLessThan(0.1);
    }
  );

  it('should place a tilted CRS code as an affine image of its ob_tran', () => {
    const state = createState({
      customCode: '+proj=eqearth',
      longitude: 30,
      latitude: 20
    });
    expect(
      maxAffineResidual(state, { customCode: '+proj=eqearth' })
    ).toBeLessThan(0.1);
  });

  it('should refuse a projection without CRS', () => {
    expect(
      createCurrentProjectionForward({
        state: createState({ selected: 'armadillo' })
      })
    ).toBeNull();
  });
});
