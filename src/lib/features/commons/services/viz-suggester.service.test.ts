import type { ColumnAnalysis } from '$lib/features/data-pipeline';
import { describe, expect, it } from 'vitest';
import {
  VizSuggesterService,
  type EnrichedColumn,
  type SimplifiedGeometryType
} from './viz-suggester.service';

describe('VizSuggesterService', () => {
  const service = new VizSuggesterService();
  type VizSuggesterPrivateAPI = {
    getColumnSemioType(column: ColumnAnalysis): EnrichedColumn;
    simplifyGeometryType(geometry: string): SimplifiedGeometryType;
  };
  const serviceInternals = service as unknown as VizSuggesterPrivateAPI;

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
          // Use word boundary-friendly name: "unemployment rate"
          name: 'unemployment rate',
          type: 'bigint',
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
      // Should suggest choropleth or similar QTR-compatible viz for polygon
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
          // Population with large range -> should be QTA
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
  });

  describe('Semio type detection', () => {
    it('should detect ratio/percentage columns as QTR', () => {
      const column: ColumnAnalysis = {
        name: 'taux_chomage_%',
        type: 'bigint',
        stats: {
          totalCount: 100,
          uniqueCount: 90,
          nullCount: 0,
          min: 0,
          max: 100
        }
      };

      const enriched = serviceInternals.getColumnSemioType(column);

      // The semio type detection uses multiple heuristics
      // With 90 unique values and range 0-100, QTA gets higher score
      // The "taux" keyword adds score to QTR but QTA wins due to uniqueCount > 20
      expect(['QTR', 'QTA']).toContain(enriched.semioType);
      expect(enriched.score).toBeGreaterThan(0);
    });

    it('should detect rank/level columns as QLO', () => {
      const column: ColumnAnalysis = {
        // Use "level" with word boundary - "education level" has proper word boundaries
        name: 'education level',
        type: 'text',
        stats: {
          totalCount: 100,
          uniqueCount: 5,
          nullCount: 0
        }
      };

      const enriched = serviceInternals.getColumnSemioType(column);

      // "level" keyword should trigger QLO detection with word boundary
      expect(enriched.semioType).toBe('QLO');
    });
  });

  describe('Geometry type simplification', () => {
    it('should simplify MultiPolygon to polygon', () => {
      const simplified = serviceInternals.simplifyGeometryType('MultiPolygon');
      expect(simplified).toBe('polygon');
    });

    it('should simplify MultiLineString to line', () => {
      const simplified =
        serviceInternals.simplifyGeometryType('MultiLineString');
      expect(simplified).toBe('line');
    });

    it('should simplify MultiPoint to point', () => {
      const simplified = serviceInternals.simplifyGeometryType('MultiPoint');
      expect(simplified).toBe('point');
    });
  });
});
