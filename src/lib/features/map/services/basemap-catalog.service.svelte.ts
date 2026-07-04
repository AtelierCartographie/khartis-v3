import type { ProcessedDataset } from '$lib/features/data-pipeline';
import type { GeoColumnInfo } from '$lib/features/data-pipeline/types';
import type { GPSBounds } from '$lib/features/duckdb';
import { GEO_COLUMN_TYPE } from '../../commons/constants/data.constants';
import { PipelineError } from '../../commons/pipeline.errors';
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import {
  CATALOG_SIMPLIFICATION_PRIORITY,
  getBasemapVariantFamily,
  getPreferredBasemapFile
} from './basemap-variants.utils';
import type {
  BasemapMetadata,
  BasemapSuggestion
} from '../types/basemap.types';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';
const BASEMAP_CATALOG_FETCH_ERROR_CODE = 'BASEMAP_CATALOG_FETCH_FAILED';
const GPS_SCORE_EPSILON = 1e-9;
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
  shareBasemap?: number;
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

function getBasemapYearValue(basemap: BasemapMetadata): number {
  const parsedYear = Number.parseInt(basemap.date, 10);
  return Number.isNaN(parsedYear) ? Number.NEGATIVE_INFINITY : parsedYear;
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
      if (Math.abs(scoreDelta) > GPS_SCORE_EPSILON) {
        return scoreDelta;
      }

      if (left.metrics.fullyContainsData && right.metrics.fullyContainsData) {
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
        : 'GPS bbox overlap'
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
      matchReason: 'Join synthesis coverage'
    }));
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

export function calculateGeoColumnBasemapMatchScore(
  geoColumnName: string,
  basemap: BasemapMetadata,
  geoColumnType?: GeoColumnInfo['type']
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const columnNameLower = geoColumnName.toLowerCase();
  const searchText = getSearchableText(basemap);

  const isCountryType =
    geoColumnType === GEO_COLUMN_TYPE.COUNTRY_NAME ||
    geoColumnType === GEO_COLUMN_TYPE.ISO2 ||
    geoColumnType === GEO_COLUMN_TYPE.ISO3;

  const isWorldBasemap =
    basemap.file.includes('monde') ||
    basemap.file.includes('world') ||
    searchText.includes('world') ||
    searchText.includes('countries') ||
    searchText.includes('monde') ||
    searchText.includes('pays');

  if (isCountryType && isWorldBasemap) {
    score += 60;
    reasons.push('Country type match');
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

  if (geoColumnType === GEO_COLUMN_TYPE.NUTS && searchText.includes('nuts')) {
    score += 60;
    reasons.push('NUTS type match');
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
  const basemapYear = parseInt(basemap.date);
  if (!isNaN(basemapYear)) {
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
    reason: reasons.join(', ') || 'Generic match'
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

  const geoColumnInfo = dataset.geoDetection?.geoColumns?.find(
    (candidate) => candidate.columnName === geoColumn!.name
  );
  const geoColumnType = geoColumnInfo?.type;

  return basemaps
    .map((basemap) => {
      const { score, reason } = calculateGeoColumnBasemapMatchScore(
        geoColumn!.name,
        basemap,
        geoColumnType
      );

      return {
        ...basemap,
        matchScore: score,
        matchReason: reason
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

    try {
      const response = await fetch(
        resolveStaticAssetUrl(BASEMAP_METADATA_PATH)
      );

      if (!response.ok) {
        throw new PipelineError(
          `Failed to fetch catalog: ${response.statusText}`,
          BASEMAP_CATALOG_FETCH_ERROR_CODE,
          {
            status: response.status,
            statusText: response.statusText
          }
        );
      }

      state.basemaps = await response.json();
      invalidateCatalogBasemapsCache();
      state.isLoaded = true;
    } catch (error) {
      logger.error('Failed to load basemap catalog', LogCategory.MAP, error);
      throw error;
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
    addCustomBasemap
  };
}

export const basemapCatalogService = createBasemapCatalogService();
