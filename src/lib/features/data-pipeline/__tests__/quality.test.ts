import { describe, expect, it } from 'vitest';
import { PIPELINE_CONST } from '../constants';
import { computeQualityWarnings } from '../operations/quality';
import type { EnrichedColumn } from '../types';
import { ColumnType } from '../types';

function createMockColumn(
  overrides: Partial<EnrichedColumn> = {}
): EnrichedColumn {
  return {
    name: 'test_column',
    type: ColumnType.TEXT,
    values: [],
    stats: {
      name: 'test_column',
      type: ColumnType.TEXT,
      count: 100,
      nulls: 0,
      uniques: 50
    },
    ...overrides
  };
}

describe('Quality Warnings', () => {
  describe('computeQualityWarnings', () => {
    it('should warn when rowCount === 0 (headers only)', () => {
      const columns: EnrichedColumn[] = [];
      const warnings = computeQualityWarnings(columns, 0);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should warn when rowCount === 1 (single row)', () => {
      const columns = [createMockColumn()];
      const warnings = computeQualityWarnings(columns, 1);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should warn when rowCount < 5 (very small dataset)', () => {
      const columns = [createMockColumn()];
      const warnings = computeQualityWarnings(columns, 3);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should warn when null ratio > 50%', () => {
      const columns = [
        createMockColumn({
          name: 'high_null_column',
          stats: {
            name: 'high_null_column',
            type: ColumnType.TEXT,
            count: 100,
            nulls: 60,
            uniques: 20
          }
        })
      ];
      const warnings = computeQualityWarnings(columns, 100);
      expect(warnings.some((w) => w.includes('high_null_column'))).toBe(true);
    });

    it('should NOT warn when null ratio is exactly 50%', () => {
      const columns = [
        createMockColumn({
          name: 'borderline_column',
          stats: {
            name: 'borderline_column',
            type: ColumnType.TEXT,
            count: 100,
            nulls: 50,
            uniques: 25
          }
        })
      ];
      const warnings = computeQualityWarnings(columns, 100);
      expect(warnings.some((w) => w.includes('borderline_column'))).toBe(false);
    });

    it('should warn when cardinality < 1%', () => {
      const columns = [
        createMockColumn({
          name: 'low_cardinality_column',
          stats: {
            name: 'low_cardinality_column',
            type: ColumnType.TEXT,
            count: 10000,
            nulls: 0,
            uniques: 5
          }
        })
      ];
      const warnings = computeQualityWarnings(columns, 10000);
      expect(warnings.some((w) => w.includes('low_cardinality_column'))).toBe(
        true
      );
    });

    it('should NOT warn when cardinality is exactly 1%', () => {
      const columns = [
        createMockColumn({
          name: 'borderline_cardinality',
          stats: {
            name: 'borderline_cardinality',
            type: ColumnType.TEXT,
            count: 1000,
            nulls: 0,
            uniques: 10
          }
        })
      ];
      const warnings = computeQualityWarnings(columns, 1000);
      expect(warnings.some((w) => w.includes('borderline_cardinality'))).toBe(
        false
      );
    });

    it('should return empty warnings for healthy dataset', () => {
      const columns = [
        createMockColumn({
          name: 'healthy_column',
          stats: {
            name: 'healthy_column',
            type: ColumnType.NUMBER,
            count: 1000,
            nulls: 50,
            uniques: 200
          }
        })
      ];
      const warnings = computeQualityWarnings(columns, 1000);
      expect(warnings).toHaveLength(0);
    });

    it('should handle multiple warnings for same column', () => {
      const columns = [
        createMockColumn({
          name: 'problematic_column',
          stats: {
            name: 'problematic_column',
            type: ColumnType.TEXT,
            count: 100,
            nulls: 60,
            uniques: 0
          }
        })
      ];
      const warnings = computeQualityWarnings(columns, 100);
      const problemWarnings = warnings.filter((w) =>
        w.includes('problematic_column')
      );
      expect(problemWarnings.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty columns array with non-zero rowCount', () => {
      const warnings = computeQualityWarnings([], 100);
      expect(warnings).toHaveLength(0);
    });

    it('should handle column with zero count in stats', () => {
      const columns = [
        createMockColumn({
          name: 'empty_stats_column',
          stats: {
            name: 'empty_stats_column',
            type: ColumnType.TEXT,
            count: 0,
            nulls: 0,
            uniques: 0
          }
        })
      ];
      const warnings = computeQualityWarnings(columns, 100);
      expect(warnings).toBeDefined();
    });
  });

  describe('Quality Thresholds', () => {
    it('should use HIGH_NULL_RATIO_THRESHOLD from constants', () => {
      expect(PIPELINE_CONST.QUALITY.HIGH_NULL_RATIO_THRESHOLD).toBe(0.5);
    });

    it('should use LOW_CARDINALITY_THRESHOLD from constants', () => {
      expect(PIPELINE_CONST.QUALITY.LOW_CARDINALITY_THRESHOLD).toBe(0.01);
    });
  });
});
