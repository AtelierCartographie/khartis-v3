import type {
  BasemapMetadata,
  BasemapSuggestion,
  BasemapCatalog
} from '../types/basemap.types';
import type { ProcessedDataset } from '../../commons/utils/data-pipeline.utils';
import { logger, LogCategory } from '../../commons/utils/logger';

const BASEMAP_METADATA_URL = '/basemaps/all-basemaps-metadata.json';

class BasemapCatalogService {
  private _state = $state<{
    catalog: BasemapCatalog | null;
    isLoaded: boolean;
  }>({
    catalog: null,
    isLoaded: false
  });

  get catalog(): BasemapCatalog | null {
    return this._state.catalog;
  }

  get basemaps(): BasemapMetadata[] {
    return this._state.catalog?.basemaps ?? [];
  }

  get isLoaded(): boolean {
    return this._state.isLoaded;
  }

  async loadCatalog(): Promise<void> {
    if (this._state.isLoaded) {
      return;
    }

    try {
      logger.info('Loading basemap catalog', LogCategory.MAP);
      const response = await fetch(BASEMAP_METADATA_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch catalog: ${response.statusText}`);
      }

      const basemaps: BasemapMetadata[] = await response.json();

      this._state.catalog = {
        basemaps,
        version: '1.0.0'
      };

      this._state.isLoaded = true;

      logger.success(
        `Loaded catalog with ${basemaps.length} basemaps`,
        LogCategory.MAP
      );
    } catch (error) {
      logger.error('Failed to load basemap catalog', LogCategory.MAP, error);
      throw error;
    }
  }

  getSuggestions(
    dataset: ProcessedDataset,
    limit: number = 3
  ): BasemapSuggestion[] {
    if (!this._state.catalog) {
      logger.warn('Catalog not loaded', LogCategory.MAP);
      return [];
    }

    const geoColumn = dataset.columns.find(
      (c: any) => c.type === 'text' && c.subtype === 'geographic'
    );

    if (!geoColumn) {
      logger.warn('No geographic column found in dataset', LogCategory.MAP);
      return [];
    }

    const suggestions = this._state.catalog.basemaps
      .map((basemap) => {
        const { score, reason } = this.calculateMatchScore(
          dataset,
          geoColumn.name,
          basemap
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

    logger.info(
      `Generated ${suggestions.length} suggestions for dataset`,
      LogCategory.MAP
    );

    return suggestions;
  }

  private calculateMatchScore(
    dataset: ProcessedDataset,
    geoColumnName: string,
    basemap: BasemapMetadata
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    const columnNameLower = geoColumnName.toLowerCase();
    const basemapTitleLower = basemap.title.toLowerCase();
    const basemapDescLower = basemap.description.toLowerCase();

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
      columnNameLower.includes('country') ||
      (columnNameLower.includes('pays') &&
        (basemapTitleLower.includes('country') ||
          basemapTitleLower.includes('world') ||
          basemapTitleLower.includes('monde')))
    ) {
      score += 50;
      reasons.push('Country match');
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
      score,
      reason: reasons.join(', ') || 'Generic match'
    };
  }

  searchBasemaps(query: string): BasemapMetadata[] {
    if (!this._state.catalog) {
      return [];
    }

    const queryLower = query.toLowerCase();

    return this._state.catalog.basemaps.filter((basemap) => {
      return (
        basemap.title.toLowerCase().includes(queryLower) ||
        basemap.description.toLowerCase().includes(queryLower) ||
        basemap.file.toLowerCase().includes(queryLower)
      );
    });
  }

  getBasemapById(basemapId: string): BasemapMetadata | null {
    if (!this._state.catalog) {
      return null;
    }

    return (
      this._state.catalog.basemaps.find((b) => b.file === basemapId) ?? null
    );
  }

  filterByYear(minYear: number, maxYear?: number): BasemapMetadata[] {
    if (!this._state.catalog) {
      return [];
    }

    return this._state.catalog.basemaps.filter((basemap) => {
      const year = parseInt(basemap.date);
      if (isNaN(year)) return false;

      if (maxYear) {
        return year >= minYear && year <= maxYear;
      }

      return year >= minYear;
    });
  }
}

export const basemapCatalogService = new BasemapCatalogService();
