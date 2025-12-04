/**
 * @module VizSuggesterService
 * @description Cartographic visualization suggestion service based on semio analysis of the dataset
 *
 * 3-step algorithm:
 * 1. Determine the semiological type of each column (QTA, QTR, QL, QLO, geoid, geolat, geolon)
 * 2. Sort columns by relevance (score and missing data)
 * 3. Apply viz criteria compatible with the geometry type
 *
 * Based on the original algorithm from khartis-pipeline-old/src/lib/viz_suggestions.ts
 */

import type { ColumnAnalysis } from '$lib/features/data-pipeline/models/column-analysis';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

// ===========================
// TYPES
// ===========================

export type GeometryType =
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon';
export type SimplifiedGeometryType = 'point' | 'line' | 'polygon';
export type SemioType =
  | 'geoid'
  | 'geolat'
  | 'geolon'
  | 'QTA'
  | 'QTR'
  | 'QL'
  | 'QLO';

export interface VizSuggestion {
  id: string;
  label: string;
  nbColumns: number;
  semioTypes: SemioType[];
  geometries: SimplifiedGeometryType[];
  columns?: string[];
  score?: number;
}

export interface EnrichedColumn extends ColumnAnalysis {
  name: string;
  type: string;
  semioType: SemioType;
  score: number;
}

// ===========================
// CONSTANTES
// ===========================

const SEMIO_TYPES = {
  GEOID: 'geoid' as const,
  GEOLAT: 'geolat' as const,
  GEOLON: 'geolon' as const,
  QTA: 'QTA' as const, // Absolute Quantitative
  QTR: 'QTR' as const, // Relative Quantitative
  QL: 'QL' as const, // Qualitative
  QLO: 'QLO' as const // Ordered Qualitative
};

/**
 * Cartographic visualization criteria
 * Based on https://docs.google.com/spreadsheets/d/1F6gk998PXV4FvPNRJZ59YPnmsXJ4h6BLyRZupvrRRdw/edit#gid=0
 */
const VIZ_CRITERIA: readonly VizSuggestion[] = [
  {
    id: 'symbols_uniques',
    label: 'Symboles uniques',
    nbColumns: 0,
    semioTypes: [],
    geometries: ['point', 'polygon']
  },
  {
    id: 'polygons_colorful_QL',
    label: 'Aplats de couleur (qualitatif)',
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['polygon']
  },
  {
    id: 'choropleth',
    label: 'Choroplèthe',
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['polygon']
  },
  {
    id: 'symbols_uniques_colorful_QTR',
    label: 'Symboles colorés (quantitatif relatif)',
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_differents',
    label: 'Symboles différents (qualitatif)',
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_uniques_colorful_QL',
    label: 'Symboles colorés (qualitatif)',
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional',
    label: 'Symboles proportionnels',
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_colorful_QL',
    label: 'Symboles proportionnels colorés (qualitatif)',
    nbColumns: 2,
    semioTypes: ['QTA', 'QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_colorful_QTR',
    label: 'Symboles proportionnels colorés (quantitatif)',
    nbColumns: 2,
    semioTypes: ['QTA', 'QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_double',
    label: 'Double symboles proportionnels',
    nbColumns: 2,
    semioTypes: ['QTA', 'QTA'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'polygons_uniques',
    label: 'Polygones uniques',
    nbColumns: 0,
    semioTypes: [],
    geometries: ['polygon']
  },
  {
    id: 'lines_uniques',
    label: 'Lignes uniques',
    nbColumns: 0,
    semioTypes: [],
    geometries: ['line']
  },
  {
    id: 'lines_colorful_QL',
    label: 'Lignes colorées (qualitatif)',
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['line']
  },
  {
    id: 'lines_colorful_QTR',
    label: 'Lignes colorées (quantitatif)',
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional',
    label: 'Lignes proportionnelles',
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional_colorful_QL',
    label: 'Lignes proportionnelles colorées (qualitatif)',
    nbColumns: 2,
    semioTypes: ['QTA', 'QL'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional_colorful_QTR',
    label: 'Lignes proportionnelles colorées (quantitatif)',
    nbColumns: 2,
    semioTypes: ['QTA', 'QTR'],
    geometries: ['line']
  },
  {
    id: 'polygons_colorful_QLO',
    label: 'Aplats de couleur (qualitatif ordonné)',
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['polygon']
  },
  {
    id: 'symbols_differents_QLO',
    label: 'Symboles différents (qualitatif ordonné)',
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_uniques_colorful_QLO',
    label: 'Symboles colorés (qualitatif ordonné)',
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'lines_colorful_QLO',
    label: 'Lignes colorées (qualitatif ordonné)',
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['line']
  }
] as const;

// ===========================
// SERVICE CLASS
// ===========================

export class VizSuggesterService {
  /**
   * Suggests visualizations adapted to the dataset
   */
  suggestVisualizations(
    columns: ColumnAnalysis[],
    geometryType: GeometryType | null,
    options: { maxSuggestions?: number; debug?: boolean } = {}
  ): VizSuggestion[] {
    const { maxSuggestions = 3, debug = false } = options;

    // No geometry = no cartographic viz
    if (!geometryType) {
      return [];
    }

    const simplifiedGeomType = this.simplifyGeometryType(geometryType);

    // Enrich columns with semiological typing
    const enrichedColumns = columns
      .map((col) => this.getColumnSemioType(col))
      .sort((a, b) => {
        // Sort by descending score, then by ascending nulls
        if (b.score !== a.score) return b.score - a.score;
        const aNulls = this.getNullCount(a);
        const bNulls = this.getNullCount(b);
        return aNulls - bNulls;
      })
      .filter((col) => col.semioType !== 'geoid') // Exclude ID columns
      .filter((col) => this.getUniqueCount(col) > 1); // Exclude columns with only 1 value

    if (debug) {
      logger.debug('Viz suggester inputs', LogCategory.VISUALIZATION, {
        geometry: simplifiedGeomType,
        columns: enrichedColumns.map((col) => ({
          name: col.name,
          semioType: col.semioType,
          score: col.score
        }))
      });
    }

    // Generate suggestions
    const suggestions = this.generateSuggestions(
      enrichedColumns,
      simplifiedGeomType
    );

    // Limit to requested number
    return suggestions.slice(0, maxSuggestions);
  }

  /**
   * Simplifie le type de géométrie
   */
  private simplifyGeometryType(geomType: GeometryType): SimplifiedGeometryType {
    if (geomType.includes('Point')) return 'point';
    if (geomType.includes('Line')) return 'line';
    if (geomType.includes('Polygon')) return 'polygon';
    return 'polygon'; // Default
  }

  /**
   * Determines the semiological type of a column
   */
  private getColumnSemioType(column: ColumnAnalysis): EnrichedColumn {
    const results: Array<{ semioType: SemioType; score: number }> = [];

    // Calculated indicators
    const totalCount = this.getTotalCount(column);
    const uniqueCount = this.getUniqueCount(column);
    const shareUniques = totalCount > 0 ? uniqueCount / totalCount : 0;
    const nullCount = this.getNullCount(column);
    const shareNulls = totalCount > 0 ? nullCount / totalCount : 0;

    const min =
      typeof column.stats?.min === 'number' ? (column.stats?.min as number) : 0;
    const max =
      typeof column.stats?.max === 'number' ? (column.stats?.max as number) : 0;

    // Keyword detection in column name
    const columnName = column.name ?? '';
    const lowerName = columnName.toLowerCase();
    const idWords = /\b(id|code|iso)\b/.test(lowerName);
    const latWords = /\b(lat|latitude)\b/.test(lowerName);
    const lonWords = /\b(lon|lng|longitude)\b/.test(lowerName);
    const ratioWords = /\b(ratio|rate|percent|pct|%|pour|taux)\b/.test(
      lowerName
    );
    const rankWords = /\b(rank|order|niveau|level)\b/.test(lowerName);

    // Simplified heuristics (no access to share_integers/floats from original DuckDB)
    const extentMagnitude = max > 0 ? Math.log10(max / Math.max(min, 1)) : 0;

    const columnType = (column.type ?? 'string').toString();

    switch (columnType) {
      case 'number':
        break;

      case 'integer':
        break;

      case 'bigint':
        results.push(
          this.isQTA({ uniqueCount, extentMagnitude }),
          this.isQTR({ ratioWords, extentMagnitude, min, max }),
          this.isQL({ shareUniques, uniqueCount }),
          this.isQLO({ rankWords }),
          this.isGeoID({ shareUniques, shareNulls, idWords }),
          this.isGeoLat({ latWords, min, max }),
          this.isGeoLon({ lonWords, min, max })
        );
        break;

      case 'boolean':
        results.push({ semioType: SEMIO_TYPES.QL, score: 2 });
        break;

      case 'string':
        break;

      case 'text':
        results.push(
          this.isQL({ shareUniques, uniqueCount }),
          this.isQLO({ rankWords }),
          this.isGeoID({ shareUniques, shareNulls, idWords })
        );
        break;

      case 'date': {
        const semioType = uniqueCount <= 10 ? SEMIO_TYPES.QL : SEMIO_TYPES.QTR;
        results.push({ semioType, score: 2 });
        break;
      }

      default:
        results.push({ semioType: SEMIO_TYPES.QL, score: 0 });
    }

    // Selection of best semiological type
    const best = results.sort((a, b) => b.score - a.score)[0];

    // Penalty if QL column with only 1 value
    if (best.semioType === SEMIO_TYPES.QL && uniqueCount === 1) {
      best.score = 0;
    }

    return {
      ...column,
      name: columnName || '(column)',
      type: columnType,
      semioType: best.semioType,
      score: best.score
    };
  }

  // ===========================
  // SEMIO TYPING HEURISTICS
  // ===========================

  private isQTA(indicators: { uniqueCount: number; extentMagnitude: number }): {
    semioType: SemioType;
    score: number;
  } {
    let score = 0;
    // Heuristic: many unique values + large range = QTA
    if (indicators.uniqueCount > 20) score += 1;
    if (indicators.extentMagnitude >= 2) score += 2;
    return { semioType: SEMIO_TYPES.QTA, score };
  }

  private isQTR(indicators: {
    ratioWords: boolean;
    extentMagnitude: number;
    min: number;
    max: number;
  }): { semioType: SemioType; score: number } {
    let score = 0;
    if (indicators.ratioWords) score += 3;
    if (indicators.extentMagnitude <= 2) score += 1;
    if (indicators.min < 0 && indicators.max > 0) score += 0.5; // Cross zero
    return { semioType: SEMIO_TYPES.QTR, score };
  }

  private isQL(indicators: { shareUniques: number; uniqueCount: number }): {
    semioType: SemioType;
    score: number;
  } {
    let score = 0;
    if (indicators.shareUniques <= 0.2) score += 2;
    if (indicators.uniqueCount <= 10) score += 1;
    return { semioType: SEMIO_TYPES.QL, score };
  }

  private isQLO(indicators: { rankWords: boolean }): {
    semioType: SemioType;
    score: number;
  } {
    let score = 0;
    if (indicators.rankWords) score += 4;
    return { semioType: SEMIO_TYPES.QLO, score };
  }

  private isGeoID(indicators: {
    shareUniques: number;
    shareNulls: number;
    idWords: boolean;
  }): { semioType: SemioType; score: number } {
    let score = 0;
    if (indicators.shareUniques >= 0.9) score += 1;
    if (indicators.shareNulls <= 0.1) score += 1.5;
    if (indicators.idWords && indicators.shareUniques >= 0.5) score += 4;
    return { semioType: SEMIO_TYPES.GEOID, score };
  }

  private isGeoLat(indicators: {
    latWords: boolean;
    min: number;
    max: number;
  }): { semioType: SemioType; score: number } {
    let score = 0;
    if (indicators.latWords) score += 4;
    if (Math.abs(indicators.min) < 90 && Math.abs(indicators.max) < 90)
      score += 2;
    return { semioType: SEMIO_TYPES.GEOLAT, score };
  }

  private isGeoLon(indicators: {
    lonWords: boolean;
    min: number;
    max: number;
  }): { semioType: SemioType; score: number } {
    let score = 0;
    if (indicators.lonWords) score += 4;
    if (Math.abs(indicators.min) < 180 && Math.abs(indicators.max) < 180)
      score += 2;
    return { semioType: SEMIO_TYPES.GEOLON, score };
  }

  // ===========================
  // SUGGESTIONS GENERATION
  // ===========================

  /**
   * Generates viz suggestions based on enriched columns
   */
  private generateSuggestions(
    columns: EnrichedColumn[],
    geometryType: SimplifiedGeometryType
  ): VizSuggestion[] {
    const results: VizSuggestion[] = [];

    if (columns.length === 0) {
      // No relevant column = basic viz
      return VIZ_CRITERIA.filter(
        (viz) =>
          viz.geometries.includes(geometryType) && viz.semioTypes.length === 0
      ) as VizSuggestion[];
    }

    if (columns.length === 1) {
      // 1 column
      results.push(...this.searchVizByType(columns[0], geometryType, 1));
    } else {
      // 2+ columns: test 1-var and 2-var
      const first = columns[0];
      const second = columns[1];

      results.push(...this.searchVizByType(first, geometryType, 1));
      results.push(...this.searchVizByType(second, geometryType, 1));
      results.push(...this.searchVizByType([first, second], geometryType, 2));

      // If < 3 suggestions, try with 3rd column
      let third: EnrichedColumn | undefined;
      if (results.length < 3 && columns.length >= 3) {
        third = columns[2];
        results.push(...this.searchVizByType(third, geometryType, 1));
        results.push(...this.searchVizByType([first, third], geometryType, 2));
        results.push(...this.searchVizByType([second, third], geometryType, 2));
      }

      // If < 3 suggestions, try with 4th column
      if (results.length < 3 && columns.length >= 4) {
        const fourth = columns[3];
        const fallbackThird = third ?? columns[2];
        results.push(...this.searchVizByType(fourth, geometryType, 1));
        results.push(...this.searchVizByType([first, fourth], geometryType, 2));
        results.push(
          ...this.searchVizByType([second, fourth], geometryType, 2)
        );
        results.push(
          ...this.searchVizByType([fallbackThird, fourth], geometryType, 2)
        );
      }
    }

    // Deduplicate by ID
    const unique = results.filter(
      (viz, index, self) => index === self.findIndex((v) => v.id === viz.id)
    );

    return unique;
  }

  /**
   * Search viz compatible with the semio type of columns
   */
  private searchVizByType(
    dataset: EnrichedColumn | EnrichedColumn[],
    geometryType: SimplifiedGeometryType,
    nbColumns: 1 | 2
  ): VizSuggestion[] {
    if (nbColumns === 1 && !Array.isArray(dataset)) {
      // 1 column
      return VIZ_CRITERIA.filter(
        (viz) =>
          viz.geometries.includes(geometryType) &&
          viz.nbColumns === nbColumns &&
          viz.semioTypes.includes(dataset.semioType)
      ).map((viz) => ({ ...viz, columns: [dataset.name] })) as VizSuggestion[];
    }

    if (nbColumns === 2 && Array.isArray(dataset) && dataset.length === 2) {
      // 2 columns
      return VIZ_CRITERIA.filter(
        (viz) =>
          viz.geometries.includes(geometryType) &&
          viz.nbColumns === nbColumns &&
          ((viz.semioTypes[0] === dataset[0].semioType &&
            viz.semioTypes[1] === dataset[1].semioType) ||
            (viz.semioTypes[1] === dataset[0].semioType &&
              viz.semioTypes[0] === dataset[1].semioType))
      ).map((viz) => ({
        ...viz,
        columns: [dataset[0].name, dataset[1].name]
      })) as VizSuggestion[];
    }

    return [];
  }

  private getTotalCount(column: ColumnAnalysis): number {
    const stats = column.stats;
    if (!stats) return 0;
    if (typeof stats.totalCount === 'number') return stats.totalCount;
    if (typeof stats.count === 'number') return stats.count;
    return 0;
  }

  private getUniqueCount(column: ColumnAnalysis): number {
    const stats = column.stats;
    if (!stats) return 0;
    if (typeof stats.uniqueCount === 'number') return stats.uniqueCount;
    if (typeof stats.uniques === 'number') return stats.uniques;
    return 0;
  }

  private getNullCount(column: ColumnAnalysis): number {
    const stats = column.stats;
    if (!stats) return 0;
    if (typeof stats.nullCount === 'number') return stats.nullCount;
    if (typeof stats.nulls === 'number') return stats.nulls;
    return 0;
  }
}

// Export singleton
export const vizSuggester = new VizSuggesterService();
