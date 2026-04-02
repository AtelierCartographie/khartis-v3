import type { ProcessedDataset } from '$lib/features/data-pipeline';
import type { GeoColumnInfo } from '$lib/features/data-pipeline/types';
import type { GPSBounds } from '$lib/features/duckdb';
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import type {
  BasemapMetadata,
  BasemapSuggestion
} from '../types/basemap.types';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';

function createBasemapCatalogService() {
  const state = $state<{
    basemaps: BasemapMetadata[];
    isLoaded: boolean;
  }>({
    basemaps: [],
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

      state.basemaps = await response.json();
      state.isLoaded = true;
    } catch (error) {
      logger.error('Failed to load basemap catalog', LogCategory.MAP, error);
      throw error;
    }
  }

  /**
   * Helper to get searchable text from basemap metadata (handles i18n fields).
   */
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

  function calculateMatchScore(
    _dataset: ProcessedDataset,
    geoColumnName: string,
    basemap: BasemapMetadata,
    geoColumnType?: GeoColumnInfo['type']
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    const columnNameLower = geoColumnName.toLowerCase();
    const searchText = getSearchableText(basemap);

    const isCountryType =
      geoColumnType === 'country_name' ||
      geoColumnType === 'iso2' ||
      geoColumnType === 'iso3';

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

    if (geoColumnType === 'nuts' && searchText.includes('nuts')) {
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

  function getSuggestions(
    dataset: ProcessedDataset,
    limit: number = 3,
    geoColumnName?: string
  ): BasemapSuggestion[] {
    if (state.basemaps.length === 0) {
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

    const suggestions = getCatalogBasemaps()
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
    if (state.basemaps.length === 0) return [];

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

    return getCatalogBasemaps()
      .map((basemap) => {
        const area = overlapArea(basemap.bbox);
        const matchScore =
          dataArea > 0
            ? Math.min((area / dataArea) * 100, 100)
            : area > 0
              ? 100
              : 0;
        return { ...basemap, matchScore, matchReason: 'GPS bbox overlap' };
      })
      .filter((s) => s.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  function searchBasemaps(query: string): BasemapMetadata[] {
    if (state.basemaps.length === 0) {
      return [];
    }

    const queryLower = query.toLowerCase();

    return state.basemaps.filter((basemap) => {
      return getSearchableText(basemap).includes(queryLower);
    });
  }

  function getBasemapById(basemapId: string): BasemapMetadata | null {
    return state.basemaps.find((basemap) => basemap.file === basemapId) ?? null;
  }

  function filterByYear(minYear: number, maxYear?: number): BasemapMetadata[] {
    return state.basemaps.filter((basemap) => {
      const year = parseInt(basemap.date);
      if (isNaN(year)) return false;
      if (maxYear) {
        return year >= minYear && year <= maxYear;
      }
      return year >= minYear;
    });
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
  }

  /**
   * Basemaps deduplicated by base name for catalog display.
   * Keeps one entry per base name, preferring "medium" simplification level.
   */
  function getCatalogBasemaps(): BasemapMetadata[] {
    const byBaseName = new Map<string, BasemapMetadata>();
    for (const bm of state.basemaps) {
      if (bm.isCustom) {
        byBaseName.set(bm.file, bm);
        continue;
      }
      const baseName = bm.file.replace(/-(low|medium|high)$/, '');
      const existing = byBaseName.get(baseName);
      if (!existing) {
        byBaseName.set(baseName, bm);
      } else if (
        bm.simplification_level === 'medium' &&
        existing.simplification_level !== 'medium'
      ) {
        byBaseName.set(baseName, bm);
      }
    }
    return Array.from(byBaseName.values());
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
    searchBasemaps,
    getBasemapById,
    filterByYear,
    addCustomBasemap
  };
}

export const basemapCatalogService = createBasemapCatalogService();
