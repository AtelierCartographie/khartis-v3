import type { ProcessedDataset } from '$lib/features/data-pipeline';
import type { GeoColumnInfo } from '$lib/features/data-pipeline/types';
import type { GPSBounds } from '$lib/features/duckdb';
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import type {
  BasemapCatalog,
  BasemapMetadata,
  BasemapSuggestion
} from '../types/basemap.types';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';

function createBasemapCatalogService() {
  const state = $state<{
    catalog: BasemapCatalog | null;
    isLoaded: boolean;
  }>({
    catalog: null,
    isLoaded: false
  });

  async function loadCatalog(): Promise<void> {
    if (state.isLoaded) {
      return;
    }

    try {
      const response = await fetch(
        resolveStaticAssetUrl(BASEMAP_METADATA_PATH)
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch catalog: ${response.statusText}`);
      }

      const basemaps: BasemapMetadata[] = await response.json();

      state.catalog = {
        basemaps,
        version: '1.0.0'
      };

      state.isLoaded = true;
    } catch (error) {
      logger.error('Failed to load basemap catalog', LogCategory.MAP, error);
      throw error;
    }
  }

  function calculateMatchScore(
    _dataset: ProcessedDataset,
    geoColumnName: string,
    basemap: BasemapMetadata,
    geoColumnType?: GeoColumnInfo['type']
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    const columnNameLower = geoColumnName.toLowerCase();
    const basemapTitleLower = basemap.title.toLowerCase();
    const basemapDescLower = basemap.description.toLowerCase();

    const isCountryType =
      geoColumnType === 'country_name' ||
      geoColumnType === 'iso2' ||
      geoColumnType === 'iso3';

    const isWorldBasemap =
      basemap.file.includes('world') ||
      basemapTitleLower.includes('world') ||
      basemapTitleLower.includes('countries') ||
      basemapTitleLower.includes('monde');

    if (isCountryType && isWorldBasemap) {
      score += 60;
      reasons.push('Country type match');
    }

    if (
      columnNameLower.includes('region') &&
      (basemapTitleLower.includes('region') ||
        basemapDescLower.includes('région'))
    ) {
      score += 50;
      reasons.push('Region match');
    }

    if (
      columnNameLower.includes('department') &&
      (basemapTitleLower.includes('department') ||
        basemapDescLower.includes('département'))
    ) {
      score += 50;
      reasons.push('Department match');
    }

    if (
      geoColumnType === 'nuts' &&
      (basemapTitleLower.includes('nuts') || basemapDescLower.includes('nuts'))
    ) {
      score += 60;
      reasons.push('NUTS type match');
    }

    if (
      columnNameLower.includes('country') ||
      columnNameLower.includes('iso') ||
      columnNameLower.includes('adm0') ||
      (columnNameLower.includes('pays') &&
        (basemapTitleLower.includes('country') ||
          basemapTitleLower.includes('world') ||
          basemapTitleLower.includes('monde')))
    ) {
      score += 50;
      reasons.push('Country match');
    }

    if (
      columnNameLower.includes('code') &&
      (basemapTitleLower.includes('world') ||
        basemapTitleLower.includes('monde'))
    ) {
      score += 30;
      reasons.push('Code match');
    }

    if (
      columnNameLower.includes('france') &&
      basemapTitleLower.includes('france')
    ) {
      score += 30;
      reasons.push('France match');
    }

    if (basemap.file.includes('world') || basemap.file.includes('countries')) {
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

  function getSuggestions(
    dataset: ProcessedDataset,
    limit: number = 3,
    geoColumnName?: string
  ): BasemapSuggestion[] {
    if (!state.catalog) {
      return [];
    }

    let geoColumn;
    if (geoColumnName) {
      geoColumn = dataset.columns.find((c) => c.name === geoColumnName);
    } else {
      geoColumn = dataset.columns.find(
        (c) =>
          c.type === 'string' &&
          (c as { subtype?: string }).subtype === 'geographic'
      );
    }

    if (!geoColumn) {
      return [];
    }

    const geoColumnInfo = dataset.geoDetection?.geoColumns?.find(
      (gc) => gc.columnName === geoColumn!.name
    );
    const geoColumnType = geoColumnInfo?.type;

    const suggestions = state.catalog.basemaps
      .map((basemap) => {
        const { score, reason } = calculateMatchScore(
          dataset,
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
      .filter((s) => s.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    return suggestions;
  }

  function getSuggestionsByGPSBbox(
    gpsBounds: GPSBounds,
    limit: number = 3
  ): BasemapSuggestion[] {
    if (!state.catalog) return [];

    function overlapArea(bbox: [number, number, number, number]): number {
      const [bMinLon, bMinLat, bMaxLon, bMaxLat] = bbox;
      const overlapW =
        Math.min(gpsBounds.maxLon, bMaxLon) -
        Math.max(gpsBounds.minLon, bMinLon);
      const overlapH =
        Math.min(gpsBounds.maxLat, bMaxLat) -
        Math.max(gpsBounds.minLat, bMinLat);
      if (overlapW <= 0 || overlapH <= 0) return 0;
      return overlapW * overlapH;
    }

    const dataArea =
      (gpsBounds.maxLon - gpsBounds.minLon) *
      (gpsBounds.maxLat - gpsBounds.minLat);

    return state.catalog.basemaps
      .map((basemap) => {
        const area = overlapArea(basemap.bbox);
        const matchScore =
          dataArea > 0 ? Math.min((area / dataArea) * 100, 100) : 0;
        return { ...basemap, matchScore, matchReason: 'GPS bbox overlap' };
      })
      .filter((s) => s.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  function searchBasemaps(query: string): BasemapMetadata[] {
    if (!state.catalog) {
      return [];
    }

    const queryLower = query.toLowerCase();

    return state.catalog.basemaps.filter((basemap) => {
      return (
        basemap.title.toLowerCase().includes(queryLower) ||
        basemap.description.toLowerCase().includes(queryLower) ||
        basemap.file.toLowerCase().includes(queryLower)
      );
    });
  }

  function getBasemapById(basemapId: string): BasemapMetadata | null {
    if (!state.catalog) {
      return null;
    }

    return (
      state.catalog.basemaps.find((basemap) => basemap.file === basemapId) ??
      null
    );
  }

  function filterByYear(minYear: number, maxYear?: number): BasemapMetadata[] {
    if (!state.catalog) {
      return [];
    }

    return state.catalog.basemaps.filter((basemap) => {
      const year = parseInt(basemap.date);
      if (isNaN(year)) return false;

      if (maxYear) {
        return year >= minYear && year <= maxYear;
      }

      return year >= minYear;
    });
  }

  function addCustomBasemap(basemap: BasemapMetadata): void {
    if (!state.catalog) {
      return;
    }

    const existingIndex = state.catalog.basemaps.findIndex(
      (existingBasemap) => existingBasemap.file === basemap.file
    );

    if (existingIndex !== -1) {
      state.catalog.basemaps[existingIndex] = basemap;
    } else {
      state.catalog.basemaps.push(basemap);
    }
  }

  return {
    get catalog(): BasemapCatalog | null {
      return state.catalog;
    },
    get basemaps(): BasemapMetadata[] {
      return state.catalog?.basemaps ?? [];
    },
    get isLoaded(): boolean {
      return state.isLoaded;
    },
    loadCatalog,
    getSuggestions,
    getSuggestionsByGPSBbox,
    searchBasemaps,
    getBasemapById,
    filterByYear,
    addCustomBasemap
  };
}

export const basemapCatalogService = createBasemapCatalogService();
