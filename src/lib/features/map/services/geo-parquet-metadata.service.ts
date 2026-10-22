import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { sqlString } from '$lib/features/commons/utils/sql.utils';
import type { DuckClient } from '$lib/features/duckdb';

export interface GeoParquetCrsMetadata {
  type?: string;
  name?: string;
  id?: {
    authority?: string;
    code?: string | number;
  };
}

export interface GeoParquetColumnMeta {
  encoding?: string;
  geometry_types?: string[];
  bbox?: [number, number, number, number];
  crs?: GeoParquetCrsMetadata;
}

export interface GeoParquetMeta {
  primary_column?: string;
  columns?: Record<string, GeoParquetColumnMeta>;
}

function decodeGeoParquetMetadataValue(value: string | Uint8Array): string {
  return value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
}

export async function readGeoParquetMetadataFromDuck(
  duck: DuckClient,
  fileId: string,
  failureMessage = 'Failed to read GeoParquet metadata'
): Promise<GeoParquetMeta | null> {
  try {
    const result = (await duck.query(
      `SELECT value FROM parquet_kv_metadata(${sqlString(fileId)}) WHERE key = 'geo'`,
      { format: 'array', useProxy: false }
    )) as Array<{ value?: string | Uint8Array }>;

    const value = result[0]?.value;
    if (value) {
      return JSON.parse(decodeGeoParquetMetadataValue(value)) as GeoParquetMeta;
    }
  } catch (error) {
    logger.error(failureMessage, LogCategory.MAP, error);
  }
  return null;
}
