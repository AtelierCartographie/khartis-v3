import { describe, expect, it } from 'vitest';
import {
  buildProjectionFromSuggestion,
  suggestProjectionsForBbox,
  type ProjectionSuggestion
} from '$lib/features/step-toolbar/tools/projections/projection-suggest.service';

describe('[S04] suggestProjectionsForBbox — world extent', () => {
  it('returns generic world-appropriate projections for the full globe', () => {
    const result = suggestProjectionsForBbox([-180, -90, 180, 90]);
    expect(result).not.toBeNull();
    expect(result?.generic.length).toBeGreaterThan(0);
    const ids = result?.generic.map((projection) => projection.id) ?? [];
    const hasWorldFriendly = ids.some((id) =>
      /robinson|naturalearth|winkel|equirectangular|mollweide|mercator|gall/i.test(
        id
      )
    );
    expect(hasWorldFriendly).toBe(true);
  });
});

describe('[S04] suggestProjectionsForBbox — France metropolitan extent', () => {
  it('suggests at least one national projection for the France mainland bbox', () => {
    const result = suggestProjectionsForBbox([-5, 41, 10, 51]);
    expect(result).not.toBeNull();
    expect(result?.national.length).toBeGreaterThan(0);
    const nationalNames = result?.national
      .map((projection) => `${projection.name} ${projection.epsg ?? ''}`)
      .join(' | ')
      .toLowerCase();
    expect(nationalNames).toMatch(/lambert|france|etrs|2154/);
  });
});

describe('[S04] suggestProjectionsForBbox — Europe extent', () => {
  it('suggests European-friendly national/generic projections for the continent', () => {
    const result = suggestProjectionsForBbox([-25, 35, 45, 72]);
    expect(result).not.toBeNull();
    const allIds = [
      ...(result?.national.map((projection) => projection.epsg ?? '') ?? []),
      ...(result?.generic.map((projection) => projection.id) ?? [])
    ].join(' ');
    const isEuropeRelevant =
      /3035|laea|etrs|europe|mercator|robinson|albers|lambert/i.test(allIds);
    expect(isEuropeRelevant).toBe(true);
  });
});

describe('[S04] suggestProjectionsForBbox — Guadeloupe extent', () => {
  it('returns a non-null suggestion set for a small overseas bbox', () => {
    const result = suggestProjectionsForBbox([-61.8, 15.8, -61.0, 16.5]);
    expect(result).not.toBeNull();
    // At minimum a generic fallback must exist
    expect(
      (result?.national.length ?? 0) + (result?.generic.length ?? 0)
    ).toBeGreaterThan(0);
  });
});

describe('[S04] suggestProjectionsForBbox — invalid inputs', () => {
  it('returns null when the bbox is invalid (min > max)', () => {
    const result = suggestProjectionsForBbox([180, 90, -180, -90]);
    expect(result).toBeNull();
  });

  it('returns null when the bbox values are out of range', () => {
    const result = suggestProjectionsForBbox([-300, -200, 400, 300]);
    expect(result).toBeNull();
  });
});

describe('[S04] suggestProjectionsForBbox — shape', () => {
  it('returns suggestions with id and proj4String or d3Config populated', () => {
    const result = suggestProjectionsForBbox([-5, 41, 10, 51]);
    expect(result).not.toBeNull();
    const all = [...(result?.national ?? []), ...(result?.generic ?? [])];
    expect(all.length).toBeGreaterThan(0);
    for (const suggestion of all) {
      expect(suggestion.id).toBeTruthy();
      const hasProjectionBackend =
        suggestion.proj4String !== null || suggestion.d3Config !== null;
      expect(hasProjectionBackend).toBe(true);
      expect(suggestion.bbox).toEqual([-5, 41, 10, 51]);
    }
  });
});

describe('[S04] suggestProjectionsForBbox — Europe vs France disambiguation', () => {
  it('returns only national-eu (EPSG:3035), never national-france, for an Europe-only bbox', () => {
    const result = suggestProjectionsForBbox([-25, 35, 45, 72]);
    expect(result).not.toBeNull();
    const nationalIds = result?.national.map((n) => n.id) ?? [];
    expect(nationalIds).toContain('national-eu');
    expect(nationalIds).not.toContain('national-france');
  });

  it('returns national-france with the highest share for a France-only bbox', () => {
    const result = suggestProjectionsForBbox([-5, 41, 10, 51]);
    expect(result).not.toBeNull();
    const france = result?.national.find((n) => n.id === 'national-france');
    expect(france).toBeTruthy();
    const others =
      result?.national.filter((n) => n.id !== 'national-france') ?? [];
    for (const other of others) {
      expect(france?.share ?? 0).toBeGreaterThan(other.share ?? 0);
    }
    expect(france?.epsg).toBe('2154');
  });

  it('returns no national for the full NUTS-2 bbox (includes French DOM-TOM)', () => {
    // static/tests-datasets/geojson/nuts2_data.geojson actual bbox
    const result = suggestProjectionsForBbox([-63.09, -21.39, 55.84, 71.12]);
    expect(result).not.toBeNull();
    // Neither France nor EU national matches because the bbox is too broad
    // (spans both DOM-TOM and Arctic Europe). Generic world-friendly projections
    // are proposed instead.
    expect(result?.national ?? []).toEqual([]);
    expect(result?.generic.length).toBeGreaterThan(0);
  });

  it('suggests orthographic and builds it (orthographic is supported)', () => {
    const result = suggestProjectionsForBbox([-63.09, -21.39, 55.84, 71.12]);
    expect(result).not.toBeNull();

    const suggestions = [
      ...(result?.national ?? []),
      ...(result?.generic ?? [])
    ];

    const orthographic = suggestions.find(
      (suggestion) => suggestion.id === 'orthographic'
    );
    expect(orthographic).toBeTruthy();
    if (orthographic) {
      expect(buildProjectionFromSuggestion(orthographic)).not.toBeNull();
    }
  });
});

describe('[S06] buildProjectionFromSuggestion — proj4 fallback contract', () => {
  it('uses the native d3 backend for generic suggestions before proj4', () => {
    const suggestion: ProjectionSuggestion = {
      id: 'azimuthal_equidistant',
      name: 'Azimuthal Equidistant',
      type: 'generic',
      proj4String:
        '+proj=aeqd +lon_0=-3.66 +lat_0=24.9 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
      bbox: [-63.09, -21.39, 55.84, 71.12],
      d3Config: {
        projection: 'geoAzimuthalEquidistant',
        rotate: [3.66, -24.9]
      }
    };

    const result = buildProjectionFromSuggestion(suggestion);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('d3');
    expect(result?.projection.rotate()[0]).toBeCloseTo(3.66);
    expect(result?.projection.rotate()[1]).toBeCloseTo(-24.9);
  });

  it('builds Winkel Tripel d3 suggestions directly', () => {
    const suggestion: ProjectionSuggestion = {
      id: 'winkel3',
      name: 'Winkel Tripel',
      type: 'generic',
      proj4String: null,
      bbox: [-180, -90, 180, 90],
      d3Config: {
        projection: 'geoWinkel3'
      }
    };

    const result = buildProjectionFromSuggestion(suggestion);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('d3');
    expect(result?.projection([0, 0])?.every(Number.isFinite)).toBe(true);
  });

  it('reports d3 when proj4 fails but d3 fallback succeeds', () => {
    const suggestion: ProjectionSuggestion = {
      id: 'transverse_cylindrical_equal_area',
      name: 'Transverse Cylindrical Equal Area',
      type: 'generic',
      proj4String:
        '+proj=tcea +lon_0=48.69 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
      bbox: [-5, 41, 10, 51],
      d3Config: {
        projection: 'geoCylindricalEqualArea'
      }
    };

    const result = buildProjectionFromSuggestion(suggestion);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('d3');
  });

  it('falls back to d3 when proj4 returns invalid coordinates', () => {
    const suggestion: ProjectionSuggestion = {
      id: 'laea',
      name: 'Lambert Azimuthal Equal Area',
      type: 'generic',
      proj4String:
        '+proj=laea +lon_0=-3.63 +lat_0=24.87 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
      bbox: [-5, 41, 10, 51],
      d3Config: {
        projection: 'geoAzimuthalEqualArea',
        rotate: [3.63, -24.87]
      }
    };

    const result = buildProjectionFromSuggestion(suggestion);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('d3');
    expect(result?.projection.rotate()[0]).toBeCloseTo(3.63);
    expect(result?.projection.rotate()[1]).toBeCloseTo(-24.87);
  });

  it('builds orthographic suggestions via the d3 backend', () => {
    const suggestion: ProjectionSuggestion = {
      id: 'orthographic',
      name: 'Orthographic',
      type: 'generic',
      proj4String:
        '+proj=ortho +lon_0=-3.63 +lat_0=24.87 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
      bbox: [-5, 41, 10, 51],
      d3Config: {
        projection: 'geoOrthographic',
        rotate: [3.63, -24.87]
      }
    };

    const result = buildProjectionFromSuggestion(suggestion);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('d3');
    expect(result?.projection([0, 0])?.every(Number.isFinite)).toBe(true);
  });
});
