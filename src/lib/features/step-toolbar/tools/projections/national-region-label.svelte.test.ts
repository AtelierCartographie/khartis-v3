import { describe, expect, it } from 'vitest';
import type { ProjectionSuggestion } from './projection-suggest.service';
import {
  getNationalRegionLabel,
  getNationalProjectionBadge
} from './national-region-label';

function nationalSuggestion(id: string): ProjectionSuggestion {
  return {
    id,
    name: 'test',
    type: 'national',
    epsg: '0000',
    share: 1,
    proj4String: '+proj=test',
    d3Config: null
  };
}

function genericSuggestion(id: string): ProjectionSuggestion {
  return {
    id,
    name: 'test',
    type: 'generic',
    proj4String: '+proj=test',
    d3Config: null
  };
}

describe('getNationalRegionLabel', () => {
  it('returns the translated label for national-eu', () => {
    const label = getNationalRegionLabel(nationalSuggestion('national-eu'));
    expect(label).toMatch(/Europe/i);
  });

  it('returns the translated label for national-france', () => {
    const label = getNationalRegionLabel(nationalSuggestion('national-france'));
    expect(label).toMatch(/France/i);
  });

  it('returns null for generic suggestions (no region applicable)', () => {
    const label = getNationalRegionLabel(genericSuggestion('mercator'));
    expect(label).toBeNull();
  });

  it('returns null for an unknown national region id (graceful fallback)', () => {
    const label = getNationalRegionLabel(
      nationalSuggestion('national-atlantis')
    );
    expect(label).toBeNull();
  });

  it('handles the legacy id shape without the "national-" prefix', () => {
    const label = getNationalRegionLabel(nationalSuggestion('france'));
    expect(label).toMatch(/France/i);
  });
});

describe('getNationalProjectionBadge', () => {
  it('appends the region to the base badge when known ("National · Europe")', () => {
    const badge = getNationalProjectionBadge(
      nationalSuggestion('national-eu'),
      'National'
    );
    expect(badge).toMatch(/^National\s·\s.+/);
    expect(badge).toContain('·');
    expect(badge.toLowerCase()).toContain('europe');
  });

  it('returns the bare base badge when the region is unknown', () => {
    const badge = getNationalProjectionBadge(
      nationalSuggestion('national-atlantis'),
      'National'
    );
    expect(badge).toBe('National');
  });

  it('returns the bare base badge for a generic suggestion', () => {
    const badge = getNationalProjectionBadge(
      genericSuggestion('mercator'),
      'National'
    );
    expect(badge).toBe('National');
  });
});
