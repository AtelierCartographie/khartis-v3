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
});

describe('[S06] buildProjectionFromSuggestion — proj4 fallback contract', () => {
  it('reports d3 when proj4 fails but d3 fallback succeeds', () => {
    const suggestion: ProjectionSuggestion = {
      id: 'transverse_cylindrical_equal_area',
      name: 'Transverse Cylindrical Equal Area',
      type: 'generic',
      proj4String:
        '+proj=tcea +lon_0=48.69 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
      d3Config: {
        projection: 'geoCylindricalEqualArea'
      }
    };

    const result = buildProjectionFromSuggestion(suggestion);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('d3');
  });
});
