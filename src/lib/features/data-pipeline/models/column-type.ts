/**
 * Supported logical column types for the data pipeline.
 */
export enum ColumnType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMBER = 'number',
  GEOMETRY = 'geometry',
  TEXT = 'text'
}

export function isNumericType(type: ColumnType): boolean {
  return type === ColumnType.NUMBER;
}

export function isTemporalType(type: ColumnType): boolean {
  return type === ColumnType.DATE;
}

export function isSpatialType(type: ColumnType): boolean {
  return type === ColumnType.GEOMETRY;
}

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
