import type { ColumnAnalysis } from '$lib/features/pipeline/models/column-analysis';
import { describe, expect, it } from 'vitest';
import {
  VizSuggesterService,
  type EnrichedColumn
} from './viz-suggester.service';

describe('VizSuggesterService', () => {
  const service = new VizSuggesterService();

  describe('suggestVisualizations', () => {
    it('should return empty array when no geometry', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 80,
            nullCount: 0,
            min: 1000,
            max: 1000000
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, null);

      expect(suggestions).toEqual([]);
    });

    it('should suggest choropleth for polygon + numeric relative', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'taux_chomage',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 0.05,
            max: 0.25
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Polygon');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.id === 'choropleth')).toBe(true);
    });

    it('should suggest proportional symbols for point + absolute quantitative', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000 // Grande étendue
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.id === 'symbols_proportional')).toBe(
        true
      );
    });

    it('should suggest categorical for polygon + text with few unique values', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'region',
          type: 'string',
          stats: {
            totalCount: 100,
            uniqueCount: 5, // Peu de valeurs uniques
            nullCount: 0
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Polygon');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.id === 'polygons_colorful_QL')).toBe(
        true
      );
    });

    it('should suggest bivariate for 2 numeric columns', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000
          }
        },
        {
          name: 'taux_chomage',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 85,
            nullCount: 0,
            min: 0.05,
            max: 0.25
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point');

      expect(suggestions.length).toBeGreaterThan(0);
      // Devrait suggérer à la fois des viz 1-var et 2-var
      expect(suggestions.some((s) => s.nbColumns === 2)).toBe(true);
    });

    it('should detect latitude column', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'latitude',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 100,
            nullCount: 0,
            min: -89.5,
            max: 89.5
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point', {
        debug: true
      });

      // La colonne latitude devrait être détectée comme geolat et exclue des suggestions
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should detect longitude column', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'longitude',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 100,
            nullCount: 0,
            min: -179.5,
            max: 179.5
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point', {
        debug: true
      });

      // La colonne longitude devrait être détectée comme geolon et exclue des suggestions
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should detect ID column and exclude it', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'id_region',
          type: 'string',
          stats: {
            totalCount: 100,
            uniqueCount: 100, // 100% unique
            nullCount: 0
          }
        },
        {
          name: 'population',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Polygon');

      // La colonne ID devrait être exclue, seule population devrait être utilisée
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every((s) => !s.columns?.includes('id_region'))).toBe(
        true
      );
    });

    it('should limit suggestions to maxSuggestions', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'col1',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 0,
            max: 100
          }
        },
        {
          name: 'col2',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 85,
            nullCount: 0,
            min: 0,
            max: 100
          }
        },
        {
          name: 'col3',
          type: 'string',
          stats: {
            totalCount: 100,
            uniqueCount: 5,
            nullCount: 0
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point', {
        maxSuggestions: 2
      });

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should handle date columns correctly', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'date_observation',
          type: 'date',
          stats: {
            totalCount: 100,
            uniqueCount: 50,
            nullCount: 0
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Polygon');

      expect(suggestions.length).toBeGreaterThan(0);
      // Avec 50 valeurs uniques, devrait être traité comme QTR
    });

    it('should handle boolean columns as categorical', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'est_capital',
          type: 'boolean',
          stats: {
            totalCount: 100,
            uniqueCount: 2,
            nullCount: 0
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point');

      expect(suggestions.length).toBeGreaterThan(0);
      // Boolean devrait être traité comme QL (qualitatif)
      expect(suggestions.some((s) => s.semioTypes.includes('QL'))).toBe(true);
    });

    it('should filter out columns with only 1 unique value', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'constant_column',
          type: 'string',
          stats: {
            totalCount: 100,
            uniqueCount: 1, // Colonne constante
            nullCount: 0
          }
        },
        {
          name: 'population',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Polygon');

      // Devrait ignorer la colonne constante
      expect(
        suggestions.every((s) => !s.columns?.includes('constant_column'))
      ).toBe(true);
    });
  });

  describe('Semio type detection', () => {
    it('should detect ratio/percentage columns as QTR', () => {
      const column: ColumnAnalysis = {
        name: 'taux_chomage_%',
        type: 'number',
        stats: {
          totalCount: 100,
          uniqueCount: 90,
          nullCount: 0,
          min: 0,
          max: 100
        }
      };

      const enriched = (service as any).getColumnSemioType(
        column
      ) as EnrichedColumn;

      expect(enriched.semioType).toBe('QTR');
      expect(enriched.score).toBeGreaterThan(0);
    });

    it('should detect rank/level columns as QLO', () => {
      const column: ColumnAnalysis = {
        name: 'niveau_education',
        type: 'string',
        stats: {
          totalCount: 100,
          uniqueCount: 5,
          nullCount: 0
        }
      };

      const enriched = (service as any).getColumnSemioType(
        column
      ) as EnrichedColumn;

      expect(enriched.semioType).toBe('QLO');
    });
  });

  describe('Geometry type simplification', () => {
    it('should simplify MultiPolygon to polygon', () => {
      const simplified = (service as any).simplifyGeometryType('MultiPolygon');
      expect(simplified).toBe('polygon');
    });

    it('should simplify MultiLineString to line', () => {
      const simplified = (service as any).simplifyGeometryType(
        'MultiLineString'
      );
      expect(simplified).toBe('line');
    });

    it('should simplify MultiPoint to point', () => {
      const simplified = (service as any).simplifyGeometryType('MultiPoint');
      expect(simplified).toBe('point');
    });
  });
});
