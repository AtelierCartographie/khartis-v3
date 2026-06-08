import type { ProjectionSuggestion } from './projection-suggest.service';

const SUGGESTION_ID_TO_PROJECTION_ID = new Map([
  ['aitoff', 'aitoff'],
  ['albers', 'albers'],
  ['armadillo', 'armadillo'],
  ['atlantis', 'atlantis'],
  ['azimuthalequalarea', 'azimuthal-equal-area'],
  ['bertin1953', 'bertin-1953'],
  ['bonne', 'bonne'],
  ['equalearth', 'equal-earth'],
  ['equirectangular', 'equirectangular'],
  ['gallpeters', 'gall-peters'],
  ['interruptedmollweide', 'interrupted-mollweide'],
  ['laea', 'azimuthal-equal-area'],
  ['lambertconformal', 'lambert-conformal'],
  ['mercator', 'mercator'],
  ['mollweide', 'mollweide'],
  ['mollweide2hemisphere', 'interrupted-mollweide'],
  ['mollweideinterrupted', 'interrupted-mollweide'],
  ['mollweideocean', 'interrupted-mollweide'],
  ['naturalearth', 'natural-earth'],
  ['peters', 'gall-peters'],
  ['robinson', 'robinson'],
  ['stereographic', 'stereographic'],
  ['winkel3', 'winkel-tripel'],
  ['winkeltripel', 'winkel-tripel']
]);

const SUGGESTION_D3_TO_PROJECTION_ID = new Map([
  ['geoAitoff', 'aitoff'],
  ['geoAlbers', 'albers'],
  ['geoArmadillo', 'armadillo'],
  ['geoAzimuthalEqualArea', 'azimuthal-equal-area'],
  ['geoBertin1953', 'bertin-1953'],
  ['geoBonne', 'bonne'],
  ['geoConicConformal', 'lambert-conformal'],
  ['geoCylindricalEqualArea', 'gall-peters'],
  ['geoEqualEarth', 'equal-earth'],
  ['geoEquirectangular', 'equirectangular'],
  ['geoInterruptedMollweide', 'interrupted-mollweide'],
  ['geoMercator', 'mercator'],
  ['geoMollweide', 'mollweide'],
  ['geoNaturalEarth1', 'natural-earth'],
  ['geoRobinson', 'robinson'],
  ['geoStereographic', 'stereographic'],
  ['geoWinkel3', 'winkel-tripel']
]);

export function getCatalogueProjectionIdForSuggestion(
  suggestion: ProjectionSuggestion
): string | undefined {
  if (suggestion.type !== 'generic') {
    return undefined;
  }

  const normalizedSuggestionId = normalizeSuggestionId(suggestion.id);
  const projectionId = SUGGESTION_ID_TO_PROJECTION_ID.get(
    normalizedSuggestionId
  );
  if (projectionId) {
    return projectionId;
  }

  const d3Projection = suggestion.d3Config?.projection;
  return d3Projection
    ? SUGGESTION_D3_TO_PROJECTION_ID.get(d3Projection)
    : undefined;
}

function normalizeSuggestionId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}
