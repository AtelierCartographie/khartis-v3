import * as m from '$lib/paraglide/messages';
import { GEOID_SCORE_THRESHOLD } from '../components/advanced-data-table/column-type-styles';
import {
  GEO_COLUMN_TYPE,
  type GeoColumnTypeValue
} from '../constants/data.constants';
import { SEMIO_TYPES, type SemioType } from './semio-detector.utils';

export interface GeoColumnResult {
  index: number;
  columnName: string;
  type: GeoColumnTypeValue;
  confidence: number;
  /** Catalog basemaps that share most of the column values, best first. */
  catalogBasemaps?: string[];
}

export interface GeoDetectionResult {
  hasGeoColumns: boolean;
  geoColumns: GeoColumnResult[];
  suggestedPrimaryGeoColumn?: GeoColumnResult;
  warnings: string[];
}

export interface GeoDetectionColumn {
  name: string;
  semioType?: SemioType;
  semioScore?: number;
  shareUniques?: number;
}

export interface GeoDetectionCatalogMatch {
  column: string;
  distinctValues: number;
  matchedValues: number;
  basemaps: string[];
}

/** Few distinct values match short catalog codes by chance (`0`, `A`, `FR`). */
export const CATALOG_MIN_DISTINCT_VALUES = 5;
export const CATALOG_MIN_MATCH_SHARE = 0.5;
const UNIQUE_SHARE = 0.95;

export function catalogMatchShare(match: GeoDetectionCatalogMatch): number {
  if (match.distinctValues < CATALOG_MIN_DISTINCT_VALUES) return 0;
  return match.matchedValues / match.distinctValues;
}

interface IdentifierCandidate {
  result: GeoColumnResult;
  inCatalog: boolean;
  isUnique: boolean;
  isSemioGeoid: boolean;
}

function compareIdentifiers(
  left: IdentifierCandidate,
  right: IdentifierCandidate
): number {
  return (
    Number(right.inCatalog) - Number(left.inCatalog) ||
    Number(right.isUnique) - Number(left.isUnique) ||
    Number(right.isSemioGeoid) - Number(left.isSemioGeoid) ||
    right.result.confidence - left.result.confidence ||
    left.result.index - right.result.index
  );
}

/**
 * Geographic columns from universal proxies (semiological typing: unique
 * identifiers, latitude and longitude ranges), with the catalog attributes
 * index as an extra guarantee when the values belong to a catalog basemap.
 */
export function buildGeoDetection(
  columns: GeoDetectionColumn[],
  catalogMatches: GeoDetectionCatalogMatch[],
  options: { hasGeometry?: boolean } = {}
): GeoDetectionResult {
  const matchByColumn = new Map(
    catalogMatches.map((match) => [match.column, match])
  );
  const coordinates: GeoColumnResult[] = [];
  const identifiers: IdentifierCandidate[] = [];

  columns.forEach((column, index) => {
    const semioScore = column.semioScore ?? 0;

    if (
      !options.hasGeometry &&
      (column.semioType === SEMIO_TYPES.GEOLAT ||
        column.semioType === SEMIO_TYPES.GEOLON)
    ) {
      coordinates.push({
        index,
        columnName: column.name,
        type:
          column.semioType === SEMIO_TYPES.GEOLAT
            ? GEO_COLUMN_TYPE.LATITUDE
            : GEO_COLUMN_TYPE.LONGITUDE,
        confidence: semioScore
      });
      return;
    }

    const match = matchByColumn.get(column.name);
    const catalogShare = match ? catalogMatchShare(match) : 0;
    const inCatalog = catalogShare >= CATALOG_MIN_MATCH_SHARE;
    const isSemioGeoid =
      column.semioType === SEMIO_TYPES.GEOID &&
      semioScore >= GEOID_SCORE_THRESHOLD;

    if (!inCatalog && !isSemioGeoid) return;

    identifiers.push({
      result: {
        index,
        columnName: column.name,
        type: GEO_COLUMN_TYPE.IDENTIFIER,
        confidence: Math.max(
          inCatalog ? catalogShare : 0,
          isSemioGeoid ? semioScore : 0
        ),
        ...(inCatalog && match ? { catalogBasemaps: match.basemaps } : {})
      },
      inCatalog,
      isUnique: (column.shareUniques ?? 0) >= UNIQUE_SHARE,
      isSemioGeoid
    });
  });

  identifiers.sort(compareIdentifiers);
  const geoColumns = [
    ...identifiers.map((candidate) => candidate.result),
    ...coordinates
  ];

  return {
    hasGeoColumns: geoColumns.length > 0,
    geoColumns,
    suggestedPrimaryGeoColumn: identifiers[0]?.result,
    warnings: []
  };
}

export function getGeoColumnDescription(column: GeoColumnResult): string {
  switch (column.type) {
    case GEO_COLUMN_TYPE.LATITUDE:
      return m.geo_detector_latitude();
    case GEO_COLUMN_TYPE.LONGITUDE:
      return m.geo_detector_longitude();
    default:
      return column.catalogBasemaps?.length
        ? m.geo_detector_catalog_identifier()
        : m.geo_detector_identifier();
  }
}

export interface LinkedVariableColumn {
  name: string;
  typeSimple?: string;
  shareUniques?: number;
}

/**
 * The detected geographic identifier, otherwise a text column that identifies
 * every row (names for a basemap of one's own). A measure is never proposed.
 */
export function pickLinkedVariable(
  geoDetection: GeoDetectionResult | undefined,
  columns: LinkedVariableColumn[]
): string | undefined {
  const primary = geoDetection?.suggestedPrimaryGeoColumn?.columnName;
  if (primary && columns.some((column) => column.name === primary)) {
    return primary;
  }

  return columns
    .filter(
      (column) =>
        column.typeSimple === 'string' &&
        (column.shareUniques ?? 0) >= UNIQUE_SHARE
    )
    .sort(
      (left, right) => (right.shareUniques ?? 0) - (left.shareUniques ?? 0)
    )[0]?.name;
}
