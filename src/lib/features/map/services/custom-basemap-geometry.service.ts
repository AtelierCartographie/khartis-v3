import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry,
  type DuckDBClientForArrow
} from '$lib/features/duckdb/orchestrator/arrow-ops';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

export interface CustomBasemapGeometryTableOptions {
  projectColumns?: readonly string[] | null;
  geometryTypeOverride?: string;
}

export async function createCustomBasemapGeometryTableFromDuck(
  duck: DuckDBClientForArrow,
  tableName: string,
  options: CustomBasemapGeometryTableOptions = {}
): Promise<ArrowTable> {
  const { table: rawTable, geomColumn } = await fetchArrowTableWithGeometry(
    tableName,
    duck,
    null,
    null,
    options.projectColumns
  );
  return addGeoArrowMetadataFromDuckDB(
    rawTable,
    tableName,
    duck,
    undefined,
    geomColumn,
    options.geometryTypeOverride
      ? { geometryType: options.geometryTypeOverride }
      : undefined
  );
}
