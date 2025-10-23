import type {
  BasemapMetadata,
  BasemapMatchResult
} from '../types/basemap.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const BASEMAPS_METADATA_URL = '/basemaps/all-basemaps-metadata.json';

export class BasemapCatalogService {
  private static cachedMetadata: BasemapMetadata[] | null = null;

  static async loadBasemapsCatalog(): Promise<BasemapMetadata[]> {
    if (this.cachedMetadata) {
      return this.cachedMetadata;
    }

    try {
      logger.info('Loading basemaps catalog', LogCategory.DATA);

      const response = await fetch(BASEMAPS_METADATA_URL);

      if (!response.ok) {
        throw new Error(
          `Failed to load basemaps metadata: ${response.statusText}`
        );
      }

      const metadata = (await response.json()) as BasemapMetadata[];

      logger.info('Basemaps catalog loaded', LogCategory.DATA, {
        count: metadata.length,
        basemaps: metadata.map((b) => b.file)
      });

      this.cachedMetadata = metadata;
      return metadata;
    } catch (error) {
      logger.error('Failed to load basemaps catalog', LogCategory.DATA, error);
      throw error;
    }
  }

  static async getBasemapByFile(
    file: string
  ): Promise<BasemapMetadata | undefined> {
    const catalog = await this.loadBasemapsCatalog();
    return catalog.find((b) => b.file === file);
  }

  static async filterBasemaps(filters: {
    searchQuery?: string;
    dateRange?: { min?: string; max?: string };
    region?: string;
  }): Promise<BasemapMetadata[]> {
    const catalog = await this.loadBasemapsCatalog();

    let filtered = catalog;

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.title.toLowerCase().includes(query) ||
          b.description.toLowerCase().includes(query) ||
          b.source.toLowerCase().includes(query)
      );
    }

    if (filters.dateRange?.min) {
      filtered = filtered.filter((b) => b.date >= filters.dateRange!.min!);
    }

    if (filters.dateRange?.max) {
      filtered = filtered.filter((b) => b.date <= filters.dateRange!.max!);
    }

    if (filters.region) {
      filtered = filtered.filter((b) =>
        b.title.toLowerCase().includes(filters.region!.toLowerCase())
      );
    }

    return filtered;
  }

  static async suggestBasemaps(
    geoCodePattern?: string,
    bbox?: [number, number, number, number]
  ): Promise<BasemapMatchResult[]> {
    const catalog = await this.loadBasemapsCatalog();
    const suggestions: BasemapMatchResult[] = [];

    for (const basemap of catalog) {
      let matchScore = 0;

      if (geoCodePattern) {
        if (
          basemap.file.includes('nuts') &&
          geoCodePattern.match(/^[A-Z]{2}\d{1,3}$/)
        ) {
          matchScore += 50;
        }

        if (
          basemap.file.includes('france') &&
          geoCodePattern.match(/^(FR|fr|france)/i)
        ) {
          matchScore += 40;
        }

        if (
          basemap.file.includes('world') ||
          basemap.file.includes('countries')
        ) {
          matchScore += 20;
        }
      }

      if (bbox && basemap.bbox) {
        const [dataMinX, dataMinY, dataMaxX, dataMaxY] = bbox;
        const [bMinX, bMinY, bMaxX, bMaxY] = basemap.bbox;

        const overlapX = Math.min(dataMaxX, bMaxX) - Math.max(dataMinX, bMinX);
        const overlapY = Math.min(dataMaxY, bMaxY) - Math.max(dataMinY, bMinY);

        if (overlapX > 0 && overlapY > 0) {
          const dataArea = (dataMaxX - dataMinX) * (dataMaxY - dataMinY);
          const basemapArea = (bMaxX - bMinX) * (bMaxY - bMinY);
          const overlapArea = overlapX * overlapY;

          const overlapRatio = overlapArea / Math.max(dataArea, basemapArea);
          matchScore += overlapRatio * 50;
        }
      }

      if (matchScore > 0) {
        suggestions.push({
          basemap,
          matchScore,
          matchedEntities: 0,
          totalEntities: 0,
          matchPercentage: 0
        });
      }
    }

    suggestions.sort((a, b) => b.matchScore - a.matchScore);

    return suggestions.slice(0, 3);
  }

  static getBasemapGeometryUrl(file: string): string {
    return `/basemaps/geometry/${file}.parquet`;
  }

  static async preloadBasemap(file: string): Promise<void> {
    try {
      const url = this.getBasemapGeometryUrl(file);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to preload basemap: ${response.statusText}`);
      }

      logger.info('Basemap preloaded', LogCategory.DATA, { file });
    } catch (error) {
      logger.error('Failed to preload basemap', LogCategory.DATA, error);
      throw error;
    }
  }
}
