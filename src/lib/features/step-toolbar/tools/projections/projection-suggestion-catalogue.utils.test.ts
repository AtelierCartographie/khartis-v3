import { describe, expect, it } from 'vitest';
import { getCatalogueProjectionIdForSuggestion } from './projection-suggestion-catalogue.utils';
import type { ProjectionSuggestion } from './projection-suggest.service';

function createSuggestion(
  overrides: Partial<ProjectionSuggestion>
): ProjectionSuggestion {
  return {
    id: 'robinson',
    name: 'Robinson',
    type: 'generic',
    proj4String: null,
    d3Config: null,
    bbox: [-10, -10, 10, 10],
    ...overrides
  };
}

describe('getCatalogueProjectionIdForSuggestion', () => {
  it('maps generic suggestion ids to catalogue projection ids', () => {
    expect(
      getCatalogueProjectionIdForSuggestion(
        createSuggestion({ id: 'equalearth' })
      )
    ).toBe('equal-earth');
  });

  it('maps generic D3 configs when the suggestion id is not enough', () => {
    expect(
      getCatalogueProjectionIdForSuggestion(
        createSuggestion({
          id: 'custom-winkel',
          d3Config: { projection: 'geoWinkel3' }
        })
      )
    ).toBe('winkel-tripel');
  });

  it('does not map national suggestions to catalogue cards', () => {
    expect(
      getCatalogueProjectionIdForSuggestion(
        createSuggestion({
          id: 'national-fr',
          type: 'national',
          d3Config: { projection: 'geoLambertConformal' }
        })
      )
    ).toBeUndefined();
  });
});
