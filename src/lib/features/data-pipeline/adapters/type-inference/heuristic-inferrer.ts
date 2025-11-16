import type { ITypeInferrer } from '../../contracts/type-inferrer';
import { ColumnType } from '../../models/column-type';
import type { InferredColumn } from '../../models/inferred-column';
import type { RawColumn } from '../../models/raw-column';

/**
 * Heuristic Type Inferrer - Infers column types using heuristics
 *
 * Type inference priority (from highest to lowest):
 * 1. BOOLEAN - true/false, 0/1, yes/no
 * 2. DATE - ISO dates, timestamps
 * 3. NUMBER - integers, floats
 * 4. GEOMETRY - GeoJSON geometry objects
 * 5. TEXT - fallback for everything else
 *
 * @example
 * ```typescript
 * const inferrer = new HeuristicTypeInferrer();
 * const numericType = inferrer.inferType(['1', '2', '3']);
 * const booleanType = inferrer.inferType(['true', 'false']);
 * ```
 */
export class HeuristicTypeInferrer implements ITypeInferrer {
  private static readonly SAMPLE_SIZE = 100;

  private static readonly MIN_CONFIDENCE = 0.8;

  inferType(values: unknown[]): ColumnType {
    const nonNullValues = values.filter(
      (v) => v !== null && v !== undefined && v !== ''
    );

    if (nonNullValues.length === 0) {
      return ColumnType.TEXT;
    }

    const sample = nonNullValues.slice(0, HeuristicTypeInferrer.SAMPLE_SIZE);
    const sampleSize = sample.length;
    const threshold = sampleSize * HeuristicTypeInferrer.MIN_CONFIDENCE;

    if (this.countMatches(sample, this.isBoolean) >= threshold) {
      return ColumnType.BOOLEAN;
    }

    if (this.countMatches(sample, this.isDate) >= threshold) {
      return ColumnType.DATE;
    }

    if (this.countMatches(sample, this.isNumber) >= threshold) {
      return ColumnType.NUMBER;
    }

    if (this.countMatches(sample, this.isGeometry) >= threshold) {
      return ColumnType.GEOMETRY;
    }

    return ColumnType.TEXT;
  }

  inferColumnTypes(columns: RawColumn[]): InferredColumn[] {
    return columns.map((col) => ({
      ...col,
      type: this.inferType(col.values)
    }));
  }

  /**
   * Count how many values match a predicate
   */
  private countMatches(
    values: unknown[],
    predicate: (v: unknown) => boolean
  ): number {
    return values.filter(predicate).length;
  }

  /**
   * Check if value is boolean
   */
  private isBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return true;

    const str = String(value).toLowerCase().trim();
    return ['true', 'false', '0', '1', 'yes', 'no', 'y', 'n'].includes(str);
  }

  /**
   * Check if value is date
   */
  private isDate(value: unknown): boolean {
    if (value instanceof Date) return true;

    const str = String(value).trim();

    const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
    if (isoPattern.test(str)) {
      const date = new Date(str);
      return !isNaN(date.getTime());
    }

    if (/^\d{13}$/.test(str)) {
      const timestamp = parseInt(str, 10);
      const date = new Date(timestamp);
      return (
        !isNaN(date.getTime()) &&
        date.getFullYear() > 1970 &&
        date.getFullYear() < 2100
      );
    }

    return false;
  }

  /**
   * Check if value is number
   */
  private isNumber(value: unknown): boolean {
    if (typeof value === 'number') return !isNaN(value) && isFinite(value);

    const str = String(value).trim();

    if (str === '') return false;

    const num = Number(str);
    return !isNaN(num) && isFinite(num);
  }

  /**
   * Check if value is geometry (GeoJSON geometry object)
   */
  private isGeometry(value: unknown): boolean {
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      return (
        typeof obj.type === 'string' &&
        [
          'Point',
          'LineString',
          'Polygon',
          'MultiPoint',
          'MultiLineString',
          'MultiPolygon'
        ].includes(obj.type) &&
        'coordinates' in obj
      );
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return this.isGeometry(parsed);
      } catch {
        return false;
      }
    }

    return false;
  }
}
