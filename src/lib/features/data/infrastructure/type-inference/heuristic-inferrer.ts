import type { ITypeInferrer } from '../../domain/interfaces/type-inferrer.interface';
import { ColumnType } from '../../domain/value-objects/column-type.vo';
import type { InferredColumn } from '../../domain/entities/inferred-column.entity';
import type { RawColumn } from '../../domain/entities/raw-column.entity';

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
 * const type = inferrer.inferType(['1', '2', '3']); // ColumnType.NUMBER
 * const type = inferrer.inferType(['true', 'false']); // ColumnType.BOOLEAN
 * ```
 */
export class HeuristicTypeInferrer implements ITypeInferrer {
  private static readonly SAMPLE_SIZE = 100; // Sample first N rows for inference

  private static readonly MIN_CONFIDENCE = 0.8; // 80% of values must match

  inferType(values: unknown[]): ColumnType {
    // Filter out null/undefined values
    const nonNullValues = values.filter(
      (v) => v !== null && v !== undefined && v !== ''
    );

    if (nonNullValues.length === 0) {
      return ColumnType.TEXT; // All null - default to text
    }

    // Sample values for performance (only check first N values)
    const sample = nonNullValues.slice(0, HeuristicTypeInferrer.SAMPLE_SIZE);
    const sampleSize = sample.length;
    const threshold = sampleSize * HeuristicTypeInferrer.MIN_CONFIDENCE;

    // Check BOOLEAN first (highest priority)
    if (this.countMatches(sample, this.isBoolean) >= threshold) {
      return ColumnType.BOOLEAN;
    }

    // Check DATE
    if (this.countMatches(sample, this.isDate) >= threshold) {
      return ColumnType.DATE;
    }

    // Check NUMBER
    if (this.countMatches(sample, this.isNumber) >= threshold) {
      return ColumnType.NUMBER;
    }

    // Check GEOMETRY
    if (this.countMatches(sample, this.isGeometry) >= threshold) {
      return ColumnType.GEOMETRY;
    }

    // Default to TEXT
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

    // ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
    const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
    if (isoPattern.test(str)) {
      const date = new Date(str);
      return !isNaN(date.getTime());
    }

    // Timestamp (milliseconds since epoch)
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

    // Empty string is not a number
    if (str === '') return false;

    // Check if it's a valid number
    // Handles: integers, floats, scientific notation, negatives
    const num = Number(str);
    return !isNaN(num) && isFinite(num);
  }

  /**
   * Check if value is geometry (GeoJSON geometry object)
   */
  private isGeometry(value: unknown): boolean {
    // Check if it's a GeoJSON geometry object
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

    // Check if it's a JSON string containing geometry
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
