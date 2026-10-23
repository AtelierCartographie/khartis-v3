import { GEO_CONSTANTS } from '$lib/features/duckdb';
import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry,
  type DuckDBClientForArrow
} from '$lib/features/duckdb/orchestrator/arrow-ops';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

export interface CustomBasemapGeometryTableOptions {
  projectColumns?: readonly string[] | null;
  geometryTypeOverride?: string;
  /** Source CRS of a table to reproject to WGS84 while reading it. */
  reprojectFromCrs?: string;
}

export async function createCustomBasemapGeometryTableFromDuck(
  duck: DuckDBClientForArrow,
  tableName: string,
  options: CustomBasemapGeometryTableOptions = {}
): Promise<ArrowTable> {
  const { reprojectFromCrs } = options;
  const { table: rawTable, geomColumn } = await fetchArrowTableWithGeometry(
    tableName,
    duck,
    null,
    reprojectFromCrs ? GEO_CONSTANTS.WGS84_CRS : null,
    options.projectColumns,
    // The WGS84 variant is read right after the derived tables are rebuilt,
    // which the streaming binding can still see stale.
    reprojectFromCrs
      ? { sourceCrs: reprojectFromCrs, skipStreaming: true }
      : undefined
  );
  return addGeoArrowMetadataFromDuckDB(
    rawTable,
    tableName,
    duck,
    undefined,
    geomColumn && reprojectFromCrs
      ? {
          ...geomColumn,
          column_type: `GEOMETRY('${GEO_CONSTANTS.WGS84_CRS}')`
        }
      : geomColumn,
    options.geometryTypeOverride
      ? { geometryType: options.geometryTypeOverride }
      : undefined
  );
}
