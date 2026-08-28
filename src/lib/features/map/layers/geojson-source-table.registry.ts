import type { Table as ArrowTable } from 'apache-arrow/Arrow';

const sourceTables = new WeakMap<object, ArrowTable>();

export function registerGeoJsonSourceTable(
  geoJson: object,
  sourceTable: ArrowTable
): void {
  sourceTables.set(geoJson, sourceTable);
}

export function resolveGeoJsonSourceTable(geoJson: object): ArrowTable | null {
  return sourceTables.get(geoJson) ?? null;
}
