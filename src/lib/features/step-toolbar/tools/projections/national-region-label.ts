import * as m from '$lib/paraglide/messages';
import type { ProjectionSuggestion } from './projection-suggest.service';

export function getNationalRegionLabel(
  suggestion: ProjectionSuggestion
): string | null {
  if (suggestion.type !== 'national') return null;
  const regionId = suggestion.id.startsWith('national-')
    ? suggestion.id.slice('national-'.length)
    : suggestion.id;

  switch (regionId) {
    case 'eu':
      return m.projection_national_region_eu();
    case 'france':
      return m.projection_national_region_france();
    case 'uk':
      return m.projection_national_region_uk();
    case 'ireland':
      return m.projection_national_region_ireland();
    case 'germany':
      return m.projection_national_region_germany();
    case 'belgium':
      return m.projection_national_region_belgium();
    case 'netherlands':
      return m.projection_national_region_netherlands();
    case 'switzerland':
      return m.projection_national_region_switzerland();
    case 'italy':
      return m.projection_national_region_italy();
    case 'spain':
      return m.projection_national_region_spain();
    case 'portugal':
      return m.projection_national_region_portugal();
    case 'usa':
      return m.projection_national_region_usa();
    case 'canada':
      return m.projection_national_region_canada();
    case 'mexico':
      return m.projection_national_region_mexico();
    case 'brazil':
      return m.projection_national_region_brazil();
    case 'japan':
      return m.projection_national_region_japan();
    case 'china':
      return m.projection_national_region_china();
    case 'india':
      return m.projection_national_region_india();
    case 'australia':
      return m.projection_national_region_australia();
    case 'russia':
      return m.projection_national_region_russia();
    default:
      return null;
  }
}

export function getNationalProjectionBadge(
  suggestion: ProjectionSuggestion,
  baseLabel: string
): string {
  const region = getNationalRegionLabel(suggestion);
  return region ? `${baseLabel} · ${region}` : baseLabel;
}
