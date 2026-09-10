import type { D3Usage } from '@ateliercartographie/proj-suggest';
import type { ProjectionSuggestion } from './projection-suggest.service';

const SUGGESTION_ID_TO_PROJECTION_ID = new Map([
  ['airocean', 'airocean'],
  ['aitoff', 'aitoff'],
  ['albers', 'albers'],
  ['albersconic', 'albers'],
  ['armadillo', 'armadillo'],
  ['atlantis', 'atlantis'],
  ['azimuthalequalarea', 'azimuthal-equal-area'],
  ['azimuthalequidistant', 'azimuthal-equidistant'],
  ['bertin1953', 'bertin-1953'],
  ['bonne', 'bonne'],
  ['cassini', 'cassini'],
  ['cylindricalequalarea', 'cylindrical-equal-area'],
  ['equalearth', 'equal-earth'],
  ['equidistantconic', 'equidistant-conic'],
  ['equirectangular', 'equirectangular'],
  ['gallpeters', 'gall-peters'],
  ['imago', 'imago'],
  ['interruptedmollweide', 'interrupted-mollweide'],
  ['laea', 'azimuthal-equal-area'],
  ['lambertconformal', 'lambert-conformal'],
  ['lambertconformalconic', 'lambert-conformal'],
  ['mercator', 'mercator'],
  ['mollweide', 'mollweide'],
  ['mollweide2hemisphere', 'mollweide-hemispheres'],
  ['mollweideinterrupted', 'interrupted-mollweide'],
  ['mollweideocean', 'mollweide-oceans'],
  ['naturalearth', 'natural-earth'],
  ['peirce', 'peirce-quincuncial'],
  ['peircequincuncial', 'peirce-quincuncial'],
  ['peters', 'gall-peters'],
  ['robinson', 'robinson'],
  ['stereographic', 'stereographic'],
  ['times', 'times'],
  ['transversemercator', 'transverse-mercator'],
  ['waterman', 'waterman'],
  ['winkel3', 'winkel-tripel'],
  ['winkeltripel', 'winkel-tripel']
]);

const SUGGESTION_D3_TO_PROJECTION_ID = new Map([
  ['geoAirocean', 'airocean'],
  ['geoAitoff', 'aitoff'],
  ['geoAlbers', 'albers'],
  ['geoArmadillo', 'armadillo'],
  ['geoAzimuthalEqualArea', 'azimuthal-equal-area'],
  ['geoAzimuthalEquidistant', 'azimuthal-equidistant'],
  ['geoBertin1953', 'bertin-1953'],
  ['geoBonne', 'bonne'],
  ['geoCassini', 'cassini'],
  ['geoConicConformal', 'lambert-conformal'],
  ['geoConicEquidistant', 'equidistant-conic'],
  ['geoCylindricalEqualArea', 'gall-peters'],
  ['geoEqualEarth', 'equal-earth'],
  ['geoEquirectangular', 'equirectangular'],
  ['geoImago', 'imago'],
  ['geoInterrupt', 'mollweide-oceans'],
  ['geoInterruptedMollweide', 'interrupted-mollweide'],
  ['geoInterruptedMollweideHemispheres', 'mollweide-hemispheres'],
  ['geoMercator', 'mercator'],
  ['geoMollweide', 'mollweide'],
  ['geoNaturalEarth1', 'natural-earth'],
  ['geoPeirceQuincuncial', 'peirce-quincuncial'],
  ['geoPolyhedralWaterman', 'waterman'],
  ['geoRobinson', 'robinson'],
  ['geoStereographic', 'stereographic'],
  ['geoTimes', 'times'],
  ['geoTransverseMercator', 'transverse-mercator'],
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

  return getCatalogueProjectionIdForD3Config(suggestion.d3Config);
}

export function getCatalogueProjectionIdForD3Config(
  config: D3Usage | null | undefined
): string | undefined {
  return config
    ? SUGGESTION_D3_TO_PROJECTION_ID.get(config.projection)
    : undefined;
}

function normalizeSuggestionId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}
