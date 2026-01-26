import type { ColumnAnalysis } from '$lib/features/data-pipeline';
import { describe, expect, it } from 'vitest';
import { VizSuggesterService } from './viz-suggester.service';

describe('VizSuggesterService', () => {
  const service = new VizSuggesterService();

  describe('suggestVisualizations', () => {
    it('should return empty array when no geometry', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'bigint',
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
          name: 'unemployment_rate',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 5,
            max: 25
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Polygon');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(
        suggestions.some(
          (s) =>
            s.id === 'choropleth' ||
            s.id === 'symbols_uniques_colorful_QTR' ||
            s.semioTypes.includes('QTR')
        )
      ).toBe(true);
    });

    it('should suggest proportional symbols for point + absolute quantitative', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000 // Large range
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
          type: 'text',
          stats: {
            totalCount: 100,
            uniqueCount: 5, // Few unique values
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

    it('should suggest visualizations for multiple columns', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000 // Large range = high magnitude
          }
        },
        {
          // Category column
          name: 'region',
          type: 'text',
          stats: {
            totalCount: 100,
            uniqueCount: 5, // Few unique values = categorical
            nullCount: 0
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point');

      // Should return at least one suggestion
      expect(suggestions.length).toBeGreaterThan(0);
      // Each suggestion should have valid structure
      suggestions.forEach((s) => {
        expect(s.id).toBeDefined();
        expect(s.nbColumns).toBeGreaterThanOrEqual(1);
        expect(s.semioTypes).toBeDefined();
      });
    });

    it('should detect latitude column and exclude from viz suggestions', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'latitude',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 100,
            nullCount: 0,
            min: -89.5,
            max: 89.5
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point');

      // Latitude columns should be detected as geolat and filtered out
      // Since it's the only column, no viz-relevant columns remain
      // Result should be basic point viz without the lat column
      expect(suggestions.every((s) => !s.columns?.includes('latitude'))).toBe(
        true
      );
    });

    it('should detect longitude column and exclude from viz suggestions', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'longitude',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 100,
            nullCount: 0,
            min: -179.5,
            max: 179.5
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point');

      // Longitude columns should be detected as geolon and filtered out
      expect(suggestions.every((s) => !s.columns?.includes('longitude'))).toBe(
        true
      );
    });

    it('should detect ID column and exclude it', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'id_region',
          type: 'text',
          stats: {
            totalCount: 100,
            uniqueCount: 100, // 100% unique
            nullCount: 0
          }
        },
        {
          name: 'population',
          type: 'bigint',
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

      // The ID column should be excluded, only population should be used
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every((s) => !s.columns?.includes('id_region'))).toBe(
        true
      );
    });

    it('should limit suggestions to maxSuggestions', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'col1',
          type: 'bigint',
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
          type: 'bigint',
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
          type: 'text',
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
      // With 50 unique values, should be treated as QTR
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
      // Boolean should be treated as QL (qualitative)
      expect(suggestions.some((s) => s.semioTypes.includes('QL'))).toBe(true);
    });

    it('should filter out columns with only 1 unique value', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'constant_column',
          type: 'text',
          stats: {
            totalCount: 100,
            uniqueCount: 1, // Constant column
            nullCount: 0
          }
        },
        {
          name: 'population',
          type: 'bigint',
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

      // Should ignore the constant column
      expect(
        suggestions.every((s) => !s.columns?.includes('constant_column'))
      ).toBe(true);
    });

    it('should handle MultiPoint geometry', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'MultiPoint');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.geometries.includes('point'))).toBe(
        true
      );
    });

    it('should handle MultiLineString geometry', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'traffic',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 80,
            nullCount: 0,
            min: 100,
            max: 10000
          }
        }
      ];

      const suggestions = service.suggestVisualizations(
        columns,
        'MultiLineString'
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.geometries.includes('line'))).toBe(true);
    });

    it('should handle MultiPolygon geometry', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'area',
          type: 'number',
          stats: {
            totalCount: 100,
            uniqueCount: 95,
            nullCount: 0,
            min: 1,
            max: 100
          }
        }
      ];

      const suggestions = service.suggestVisualizations(
        columns,
        'MultiPolygon'
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.geometries.includes('polygon'))).toBe(
        true
      );
    });

    it('should generate multiple suggestions for multiple columns', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'population',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 0,
            min: 1000,
            max: 10000000
          }
        },
        {
          name: 'region',
          type: 'text',
          stats: {
            totalCount: 100,
            uniqueCount: 5,
            nullCount: 0
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Point', {
        maxSuggestions: 5
      });

      // With 2 columns, should generate multiple suggestions
      expect(suggestions.length).toBeGreaterThan(0);
      // Check that suggestions reference the columns
      const hasColumnReferences = suggestions.some(
        (s) =>
          s.columns &&
          (s.columns.includes('population') || s.columns.includes('region'))
      );
      expect(hasColumnReferences).toBe(true);
    });

    it('should return suggestions in order of relevance', () => {
      const columns: ColumnAnalysis[] = [
        {
          name: 'col_high_nulls',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 50,
            nullCount: 50, // 50% nulls
            min: 0,
            max: 100
          }
        },
        {
          name: 'col_low_nulls',
          type: 'bigint',
          stats: {
            totalCount: 100,
            uniqueCount: 90,
            nullCount: 5, // Only 5% nulls
            min: 0,
            max: 100
          }
        }
      ];

      const suggestions = service.suggestVisualizations(columns, 'Polygon');

      // Suggestions should prioritize columns with fewer nulls
      if (suggestions.length > 1) {
        const firstSuggestion = suggestions[0];
        if (firstSuggestion.columns && firstSuggestion.columns.length > 0) {
          // First suggestion should use the better column
          expect(firstSuggestion.columns).toContain('col_low_nulls');
        }
      }
    });
  });
});
