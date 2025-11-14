/**
 * Column type enumeration
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
 * const numeric = inferType(['1', '2', '3']);
 * const boolean = inferType(['true', 'false']);
 * const date = inferType(['2025-01-01']);
 * ```
 */
export enum ColumnType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMBER = 'number',
  GEOMETRY = 'geometry',
  TEXT = 'text'
}

/**
 * Check if a ColumnType is numeric
 *
 * @param type - ColumnType to check
 * @returns true if type is NUMBER
 */
export function isNumericType(type: ColumnType): boolean {
  return type === ColumnType.NUMBER;
}

/**
 * Check if a ColumnType is temporal
 *
 * @param type - ColumnType to check
 * @returns true if type is DATE
 */
export function isTemporalType(type: ColumnType): boolean {
  return type === ColumnType.DATE;
}

/**
 * Check if a ColumnType is spatial
 *
 * @param type - ColumnType to check
 * @returns true if type is GEOMETRY
 */
export function isSpatialType(type: ColumnType): boolean {
  return type === ColumnType.GEOMETRY;
}

/**
 * Convert DuckDB type to ColumnType
 *
 * @param duckType - DuckDB type string (e.g., 'VARCHAR', 'DOUBLE', 'GEOMETRY')
 * @returns Corresponding ColumnType
 */
export function fromDuckDBType(duckType: string): ColumnType {
  const normalized = duckType.toLowerCase();

  if (normalized.includes('bool')) return ColumnType.BOOLEAN;
  if (normalized.includes('date') || normalized.includes('time'))
    return ColumnType.DATE;
  if (
    normalized.includes('int') ||
    normalized.includes('double') ||
    normalized.includes('float') ||
    normalized.includes('numeric')
  ) {
    return ColumnType.NUMBER;
  }
  if (normalized.includes('geometry') || normalized.includes('geom'))
    return ColumnType.GEOMETRY;

  return ColumnType.TEXT;
}
