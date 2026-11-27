import { getBasemapLatestValidYear } from '../utils/basemap-validity.utils';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import type { GPSBounds } from '$lib/features/duckdb';
import { PipelineError } from '../../commons/pipeline.errors';
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import {
  FetchTimeoutError,
  fetchWithTimeout
} from '../../commons/utils/fetch-with-timeout';
import * as m from '$lib/paraglide/messages';
import { BASEMAP_FETCH_TIMEOUT_MS } from '../constants/basemap-fetch.constants';
import {
  CATALOG_SIMPLIFICATION_PRIORITY,
  getBasemapVariantFamily,
  getPreferredBasemapFile
} from './basemap-variants.utils';
import { isOSMBasemap } from './osm-tile.service';
import type {
  BasemapMetadata,
  BasemapSuggestion
} from '../types/basemap.types';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';
const BASEMAP_CATALOG_FETCH_ERROR_CODE = 'BASEMAP_CATALOG_FETCH_FAILED';
const GPS_SCORE_EPSILON = 1e-9;
// Catalog bboxes are rounded to the hundredth of a degree, so a basemap drawn
// over the whole data can miss a sliver of its extent: 99.96 % of a 1 km grid
// of France against a cantons bbox. Within this many points, coverages tie.
const BBOX_COVERAGE_TOLERANCE = 1;
const GPS_TEXT_REFINEMENT_MIN_SCORE = 80;
const GPS_AUTO_SELECTION_FAMILY_PRIORITY = [
  'france-region-',
  'france-departement-',
  'europe-nuts1-',
  'europe-nuts2-',
  'france-canton-',
  'europe-nuts3-',
  'france-commune-'
] as const;

interface GPSBboxMatchMetrics {
  overlapArea: number;
  dataArea: number;
  basemapArea: number;
  coverageScore: number;
  fullyContainsData: boolean;
}

interface JoinSynthesisLike {
  basemap: string;
  shareCandidate: number;
  shareBasemap?: number | null;
}

function getCatalogVariantRank(
  preferredLevelsByFamily: Map<string, string>,
  basemap: BasemapMetadata
): number {
  const level = basemap.simplification_level;
  const preferredLevel = preferredLevelsByFamily.get(
    getBasemapVariantFamily(basemap.file)
  );

  if (!level || !preferredLevel) {
    return 0;
  }

  return level === preferredLevel ? 1 : 0;
}

export function getCatalogBasemapsForDisplay(
  basemaps: BasemapMetadata[]
): BasemapMetadata[] {
  const levelsByFamily = new Map<string, Set<string>>();

  for (const basemap of basemaps) {
    if (basemap.isCustom || !basemap.simplification_level) {
      continue;
    }

    const family = getBasemapVariantFamily(basemap.file);
    const levels = levelsByFamily.get(family) ?? new Set<string>();
    levels.add(basemap.simplification_level);
    levelsByFamily.set(family, levels);
  }

  const preferredLevelsByFamily = new Map<string, string>();
  for (const [family, levels] of levelsByFamily) {
    const preferredLevel = CATALOG_SIMPLIFICATION_PRIORITY.find((level) =>
      levels.has(level)
    );
    if (preferredLevel) {
      preferredLevelsByFamily.set(family, preferredLevel);
    }
  }

  const byBaseName = new Map<string, BasemapMetadata>();

  for (const basemap of basemaps) {
    // A dataset's own derived geometry is not a basemap one can pick or join to,
    // and the reference basemap is activated from the Visualizations step.
    if (basemap.isDatasetGeometry || isOSMBasemap(basemap)) {
      continue;
    }

    if (basemap.isCustom) {
      byBaseName.set(basemap.file, basemap);
      continue;
    }

    const baseName = getBasemapVariantFamily(basemap.file);
    const existing = byBaseName.get(baseName);
    if (!existing) {
      byBaseName.set(baseName, basemap);
      continue;
    }

    if (
      getCatalogVariantRank(preferredLevelsByFamily, basemap) >
      getCatalogVariantRank(preferredLevelsByFamily, existing)
    ) {
      byBaseName.set(baseName, basemap);
    }
  }

  return Array.from(byBaseName.values());
}

export function sortCatalogBasemapsForDisplay(
  basemaps: BasemapMetadata[],
  locale: string
): BasemapMetadata[] {
  const collator = new Intl.Collator(locale, {
    sensitivity: 'base',
    numeric: true
  });
  const getTitle = (basemap: BasemapMetadata): string =>
    locale === 'fr' ? basemap.title_fr : basemap.title_en;
  const getSubtitle = (basemap: BasemapMetadata): string =>
    (locale === 'fr' ? basemap.subtitle_fr : basemap.subtitle_en) ?? '';

  return [...basemaps].sort((first, second) => {
    const firstYear = getBasemapYearValue(first);
    const secondYear = getBasemapYearValue(second);
    if (firstYear !== secondYear) {
      return secondYear - firstYear;
    }

    const titleOrder = collator.compare(getTitle(first), getTitle(second));
    return titleOrder !== 0
      ? titleOrder
      : collator.compare(getSubtitle(first), getSubtitle(second));
  });
}

function getCatalogBasemapById(
  basemaps: BasemapMetadata[],
  basemapId: string
): BasemapMetadata | null {
  const resolvedBasemapId = getPreferredBasemapFile(basemaps, basemapId);
  return basemaps.find((basemap) => basemap.file === resolvedBasemapId) ?? null;
}

function getBBoxArea(bbox: [number, number, number, number]): number {
  const width = Math.max(0, bbox[2] - bbox[0]);
  const height = Math.max(0, bbox[3] - bbox[1]);
  return width * height;
}

// Most recent year the basemap is valid for: end of its validity period when
// declared (regions valid 2017-2026 rank with the 2026 vintages), else `date`.
function getBasemapYearValue(basemap: BasemapMetadata): number {
  return getBasemapLatestValidYear(basemap) ?? Number.NEGATIVE_INFINITY;
}

function getGPSAutoSelectionFamilyRank(basemap: BasemapMetadata): number {
  const index = GPS_AUTO_SELECTION_FAMILY_PRIORITY.findIndex((prefix) =>
    basemap.file.startsWith(prefix)
  );

  return index === -1 ? GPS_AUTO_SELECTION_FAMILY_PRIORITY.length : index;
}

export function shouldPreferTextBasemapRefinementForGPS(
  gpsSuggestions: BasemapSuggestion[],
  bestTextScore: number
): boolean {
  const topGPSSuggestion = gpsSuggestions[0];

  if (!topGPSSuggestion) {
    return bestTextScore >= GPS_TEXT_REFINEMENT_MIN_SCORE;
  }

  return (
    topGPSSuggestion.matchReason !== 'GPS bbox containment' &&
    bestTextScore >= GPS_TEXT_REFINEMENT_MIN_SCORE
  );
}

export function getGPSBboxMatchMetrics(
  gpsBounds: GPSBounds,
  bbox: [number, number, number, number]
): GPSBboxMatchMetrics {
  const [bMinLon, bMinLat, bMaxLon, bMaxLat] = bbox;
  const overlapW =
    Math.min(gpsBounds.maxLon, bMaxLon) - Math.max(gpsBounds.minLon, bMinLon);
  const overlapH =
    Math.min(gpsBounds.maxLat, bMaxLat) - Math.max(gpsBounds.minLat, bMinLat);
  const overlapArea = overlapW <= 0 || overlapH <= 0 ? 0 : overlapW * overlapH;
  const dataArea = getBBoxArea([
    gpsBounds.minLon,
    gpsBounds.minLat,
    gpsBounds.maxLon,
    gpsBounds.maxLat
  ]);
  const basemapArea = getBBoxArea(bbox);
  const coverageScore =
    dataArea > 0 ? Math.min((overlapArea / dataArea) * 100, 100) : 0;

  return {
    overlapArea,
    dataArea,
    basemapArea,
    coverageScore,
    fullyContainsData:
      overlapArea > 0 && Math.abs(overlapArea - dataArea) <= GPS_SCORE_EPSILON
  };
}

function nearlyContainsData(metrics: GPSBboxMatchMetrics): boolean {
  return metrics.coverageScore >= 100 - BBOX_COVERAGE_TOLERANCE;
}

export function rankBasemapsByGPSBbox(
  basemaps: BasemapMetadata[],
  gpsBounds: GPSBounds,
  limit: number = 3
): BasemapSuggestion[] {
  return basemaps
    .map((basemap) => ({
      basemap,
      metrics: getGPSBboxMatchMetrics(gpsBounds, basemap.bbox)
    }))
    .filter(({ metrics }) => metrics.coverageScore > 0)
    .sort((left, right) => {
      const scoreDelta =
        right.metrics.coverageScore - left.metrics.coverageScore;
      if (Math.abs(scoreDelta) > BBOX_COVERAGE_TOLERANCE) {
        return scoreDelta;
      }

      if (
        nearlyContainsData(left.metrics) &&
        nearlyContainsData(right.metrics)
      ) {
        const areaDelta = left.metrics.basemapArea - right.metrics.basemapArea;
        if (Math.abs(areaDelta) > GPS_SCORE_EPSILON) {
          return areaDelta;
        }
      }

      const yearDelta =
        getBasemapYearValue(right.basemap) - getBasemapYearValue(left.basemap);
      if (yearDelta !== 0) {
        return yearDelta;
      }

      const familyDelta =
        getGPSAutoSelectionFamilyRank(left.basemap) -
        getGPSAutoSelectionFamilyRank(right.basemap);
      if (familyDelta !== 0) {
        return familyDelta;
      }

      const layerDelta =
        left.basemap.layers.length - right.basemap.layers.length;
      if (layerDelta !== 0) {
        return layerDelta;
      }

      return left.basemap.file.localeCompare(right.basemap.file);
    })
    .slice(0, limit)
    .map(({ basemap, metrics }) => ({
      ...basemap,
      matchScore: metrics.coverageScore,
      matchReason: metrics.fullyContainsData
        ? 'GPS bbox containment'
        : 'GPS bbox overlap',
      matchesData: true
    }));
}

export function rankBasemapsByJoinSynthesis(
  basemaps: BasemapMetadata[],
  synthesis: JoinSynthesisLike[],
  limit: number = 3
): BasemapSuggestion[] {
  const displayBasemaps = getCatalogBasemapsForDisplay(basemaps);
  const basemapByFamily = new Map(
    displayBasemaps.map((basemap) => [
      getBasemapVariantFamily(basemap.file),
      basemap
    ])
  );
  const aggregated = new Map<
    string,
    {
      basemap: BasemapMetadata;
      shareCandidate: number;
      shareBasemap: number;
    }
  >();

  for (const row of synthesis) {
    const displayBasemap = basemapByFamily.get(
      getBasemapVariantFamily(row.basemap)
    );
    if (!displayBasemap) {
      continue;
    }

    const existing = aggregated.get(displayBasemap.file);
    const shareBasemap = row.shareBasemap ?? 0;
    const granularityDistance = Math.abs(shareBasemap - 1);
    const existingGranularity = existing
      ? Math.abs(existing.shareBasemap - 1)
      : Number.POSITIVE_INFINITY;
    if (
      !existing ||
      row.shareCandidate > existing.shareCandidate ||
      (row.shareCandidate === existing.shareCandidate &&
        granularityDistance < existingGranularity)
    ) {
      aggregated.set(displayBasemap.file, {
        basemap: displayBasemap,
        shareCandidate: row.shareCandidate,
        shareBasemap
      });
    }
  }

  return [...aggregated.values()]
    .sort((left, right) => {
      const candidateDelta = right.shareCandidate - left.shareCandidate;
      if (Math.abs(candidateDelta) > GPS_SCORE_EPSILON) {
        return candidateDelta;
      }

      const granularityDelta =
        Math.abs(left.shareBasemap - 1) - Math.abs(right.shareBasemap - 1);
      if (Math.abs(granularityDelta) > GPS_SCORE_EPSILON) {
        return granularityDelta;
      }

      const yearDelta =
        getBasemapYearValue(right.basemap) - getBasemapYearValue(left.basemap);
      if (yearDelta !== 0) {
        return yearDelta;
      }

      return left.basemap.file.localeCompare(right.basemap.file);
    })
    .slice(0, limit)
    .map(({ basemap, shareCandidate }) => ({
      ...basemap,
      matchScore: shareCandidate,
      matchReason: 'Join synthesis coverage',
      matchesData: true
    }));
}

export interface RankedBasemapSuggestion {
  basemap: BasemapMetadata;
  score: number;
  matchesData: boolean;
}

export interface RelevantBasemapSuggestion extends RankedBasemapSuggestion {
  /** Vintages the score cannot tell apart, latest first; `basemap` is one. */
  vintages: BasemapMetadata[];
}

// An alternative is offered only when it stands close to the top suggestion:
// a basemap that finds 10 % of the values next to one that finds 95 % is noise.
const ALTERNATIVE_MIN_SCORE = 50;
const ALTERNATIVE_MIN_SHARE_OF_TOP = 0.75;
// On extent, every bbox that encloses the data scores 100 %, from the region
// up to the world, and a neighbouring region's bbox can enclose it too
// (Centre-Val de Loire around Île-de-France, 3.4 times its area). Past this
// ratio of the top suggestion's area, the data fills a small part of the map.
const EXTENT_ALTERNATIVE_MAX_AREA_RATIO = 3;
const VINTAGE_YEAR_SUFFIX_REGEX = /-\d{4}$/;

/** The basemap with its simplification level and its vintage left out. */
export function getBasemapVintageFamily(file: string): string {
  return getBasemapVariantFamily(file).replace(VINTAGE_YEAR_SUFFIX_REGEX, '');
}

function isRelevantAlternative(
  top: RankedBasemapSuggestion,
  candidate: RankedBasemapSuggestion,
  rankedBy: 'values' | 'extent'
): boolean {
  if (candidate.matchesData !== top.matchesData) return false;
  if (candidate.score < ALTERNATIVE_MIN_SCORE) return false;
  if (candidate.score < top.score * ALTERNATIVE_MIN_SHARE_OF_TOP) return false;
  if (rankedBy === 'values') return true;

  const topArea = getBBoxArea(top.basemap.bbox);
  return (
    topArea <= 0 ||
    getBBoxArea(candidate.basemap.bbox) <=
      topArea * EXTENT_ALTERNATIVE_MAX_AREA_RATIO
  );
}

/**
 * Keeps, from suggestions ranked best first, the ones worth offering: the top
 * one, then the alternatives close to it, up to `limit` cards. Vintages of a
 * basemap whose scores tie share one card, so they do not crowd out another
 * basemap: GPS points or an extent cannot tell two vintages apart.
 */
export function selectRelevantBasemapSuggestions(
  ranked: readonly RankedBasemapSuggestion[],
  options: { limit: number; rankedBy: 'values' | 'extent' }
): RelevantBasemapSuggestion[] {
  const top = ranked[0];
  if (!top) return [];

  const selected: RelevantBasemapSuggestion[] = [];
  for (const candidate of ranked) {
    const family = candidate.basemap.isCustom
      ? candidate.basemap.file
      : getBasemapVintageFamily(candidate.basemap.file);
    const stack = selected.find(
      (suggestion) =>
        !suggestion.basemap.isCustom &&
        getBasemapVintageFamily(suggestion.basemap.file) === family &&
        Math.abs(suggestion.score - candidate.score) <= BBOX_COVERAGE_TOLERANCE
    );
    if (stack) {
      stack.vintages.push(candidate.basemap);
      continue;
    }

    if (selected.length >= options.limit) continue;
    if (
      candidate !== top &&
      !isRelevantAlternative(top, candidate, options.rankedBy)
    ) {
      continue;
    }
    selected.push({ ...candidate, vintages: [candidate.basemap] });
  }

  return selected.map((suggestion) => {
    const vintages = [...suggestion.vintages].sort(
      (left, right) => getBasemapYearValue(right) - getBasemapYearValue(left)
    );
    return {
      ...suggestion,
      basemap: vintages[0] ?? suggestion.basemap,
      vintages
    };
  });
}

function getSearchableText(basemap: BasemapMetadata): string {
  return [
    basemap.title_fr,
    basemap.title_en,
    basemap.subtitle_fr ?? '',
    basemap.subtitle_en ?? '',
    basemap.file
  ]
    .join(' ')
    .toLowerCase();
}

function basemapFamily(file: string): string {
  return file.replace(/-(low|medium|high)$/, '');
}

export function calculateGeoColumnBasemapMatchScore(
  geoColumnName: string,
  basemap: BasemapMetadata,
  catalogBasemaps: readonly string[] = []
): { score: number; reason: string; matchesData: boolean } {
  let score = 0;
  const reasons: string[] = [];

  const columnNameLower = geoColumnName.toLowerCase();
  const searchText = getSearchableText(basemap);

  const isWorldBasemap =
    basemap.file.includes('monde') ||
    basemap.file.includes('world') ||
    searchText.includes('world') ||
    searchText.includes('countries') ||
    searchText.includes('monde') ||
    searchText.includes('pays');

  const family = basemapFamily(basemap.file);
  const matchesData = catalogBasemaps.some(
    (file) => basemapFamily(file) === family
  );
  if (matchesData) {
    score += 60;
    reasons.push('Catalog values match');
  }

  if (
    columnNameLower.includes('region') &&
    (searchText.includes('region') || searchText.includes('région'))
  ) {
    score += 50;
    reasons.push('Region match');
  }

  if (
    columnNameLower.includes('department') &&
    (searchText.includes('department') || searchText.includes('département'))
  ) {
    score += 50;
    reasons.push('Department match');
  }

  if (
    columnNameLower.includes('country') ||
    columnNameLower.includes('iso') ||
    columnNameLower.includes('adm0') ||
    (columnNameLower.includes('pays') && isWorldBasemap)
  ) {
    score += 50;
    reasons.push('Country match');
  }

  if (columnNameLower.includes('code') && isWorldBasemap) {
    score += 30;
    reasons.push('Code match');
  }

  if (columnNameLower.includes('france') && searchText.includes('france')) {
    score += 30;
    reasons.push('France match');
  }

  if (basemap.file.includes('monde') || basemap.file.includes('countries')) {
    score += 10;
    reasons.push('Global basemap');
  }

  const currentYear = new Date().getFullYear();
  const basemapYear = getBasemapLatestValidYear(basemap);
  if (basemapYear !== null) {
    const yearDiff = Math.abs(currentYear - basemapYear);
    if (yearDiff <= 2) {
      score += 20;
      reasons.push('Recent data');
    } else if (yearDiff <= 5) {
      score += 10;
    }
  }

  return {
    score: Math.min(score, 100),
    reason: reasons.join(', ') || 'Generic match',
    matchesData
  };
}

export function rankBasemapsByGeoColumn(
  basemaps: BasemapMetadata[],
  dataset: ProcessedDataset,
  geoColumnName?: string,
  limit: number = 3
): BasemapSuggestion[] {
  let geoColumn;
  if (geoColumnName) {
    geoColumn = dataset.columns.find((column) => column.name === geoColumnName);
  } else {
    geoColumn = dataset.columns.find(
      (column) =>
        column.type === 'string' &&
        (column as { subtype?: string }).subtype === 'geographic'
    );
  }

  if (!geoColumn) {
    return [];
  }

  const catalogBasemaps =
    dataset.geoDetection?.geoColumns?.find(
      (candidate) => candidate.columnName === geoColumn!.name
    )?.catalogBasemaps ?? [];

  return basemaps
    .map((basemap) => {
      const { score, reason, matchesData } =
        calculateGeoColumnBasemapMatchScore(
          geoColumn!.name,
          basemap,
          catalogBasemaps
        );

      return {
        ...basemap,
        matchScore: score,
        matchReason: reason,
        matchesData
      };
    })
    .filter((suggestion) => suggestion.matchScore > 0)
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, limit);
}

function createBasemapCatalogService() {
  const state = $state<{
    basemaps: BasemapMetadata[];
    isLoaded: boolean;
  }>({
    basemaps: [],
    isLoaded: false
  });
  let catalogBasemapsVersion = 0;
  let catalogBasemapsCache:
    { version: number; basemaps: BasemapMetadata[] } | undefined;

  function invalidateCatalogBasemapsCache(): void {
    catalogBasemapsVersion++;
    catalogBasemapsCache = undefined;
  }

  async function loadCatalog(): Promise<void> {
    if (state.isLoaded) {
      return;
    }

    const url = resolveStaticAssetUrl(BASEMAP_METADATA_PATH);

    try {
      const catalogBasemaps: BasemapMetadata[] = await fetchWithTimeout(
        url,
        async (response) => {
          if (!response.ok) {
            throw new PipelineError(
              `Failed to fetch catalog: ${response.statusText}`,
              BASEMAP_CATALOG_FETCH_ERROR_CODE,
              {
                status: response.status,
                statusText: response.statusText,
                url: response.url || url
              }
            );
          }

          return response.json();
        },
        BASEMAP_FETCH_TIMEOUT_MS
      );
      state.basemaps = [
        ...catalogBasemaps,
        ...state.basemaps.filter((basemap) => basemap.isCustom)
      ];
      invalidateCatalogBasemapsCache();
      state.isLoaded = true;
    } catch (error) {
      const catalogError =
        error instanceof FetchTimeoutError
          ? new PipelineError(
              m.error_download_timeout(),
              BASEMAP_CATALOG_FETCH_ERROR_CODE,
              {
                url,
                timeoutMs: error.timeoutMs
              }
            )
          : error;
      logger.error(
        'Failed to load basemap catalog',
        LogCategory.MAP,
        catalogError
      );
      throw catalogError;
    }
  }

  function getSuggestions(
    dataset: ProcessedDataset,
    limit: number = 3,
    geoColumnName?: string
  ): BasemapSuggestion[] {
    if (state.basemaps.length === 0) {
      return [];
    }

    return rankBasemapsByGeoColumn(
      getCatalogBasemaps(),
      dataset,
      geoColumnName,
      limit
    );
  }

  function getSuggestionsByGPSBbox(
    gpsBounds: GPSBounds,
    limit: number = 3
  ): BasemapSuggestion[] {
    if (state.basemaps.length === 0) return [];

    return rankBasemapsByGPSBbox(getCatalogBasemaps(), gpsBounds, limit);
  }

  function getBasemapById(basemapId: string): BasemapMetadata | null {
    return getCatalogBasemapById(state.basemaps, basemapId);
  }

  function addCustomBasemap(basemap: BasemapMetadata): void {
    const existingIndex = state.basemaps.findIndex(
      (existingBasemap) => existingBasemap.file === basemap.file
    );

    if (existingIndex !== -1) {
      state.basemaps[existingIndex] = basemap;
    } else {
      state.basemaps.push(basemap);
    }
    invalidateCatalogBasemapsCache();
  }

  function replaceCustomBasemaps(basemaps: readonly BasemapMetadata[]): void {
    state.basemaps = [
      ...state.basemaps.filter((basemap) => !basemap.isCustom),
      ...basemaps
    ];
    invalidateCatalogBasemapsCache();
  }

  function getCatalogBasemaps(): BasemapMetadata[] {
    if (catalogBasemapsCache?.version === catalogBasemapsVersion) {
      return catalogBasemapsCache.basemaps;
    }

    const basemaps = getCatalogBasemapsForDisplay(state.basemaps);
    catalogBasemapsCache = {
      version: catalogBasemapsVersion,
      basemaps
    };
    return basemaps;
  }

  return {
    get basemaps(): BasemapMetadata[] {
      return state.basemaps;
    },
    get catalogBasemaps(): BasemapMetadata[] {
      return getCatalogBasemaps();
    },
    get isLoaded(): boolean {
      return state.isLoaded;
    },
    loadCatalog,
    getSuggestions,
    getSuggestionsByGPSBbox,
    getBasemapById,
    addCustomBasemap,
    replaceCustomBasemaps
  };
}

export const basemapCatalogService = createBasemapCatalogService();
