import { LogCategory, logger } from '$lib/features/commons/utils/logger';

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

interface GeoParquetMetadataReader {
  query(
    sql: string,
    options: { format: 'array'; useProxy?: boolean }
  ): Promise<unknown>;
}

function decodeGeoParquetMetadataValue(value: string | Uint8Array): string {
  return value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
}

export async function readGeoParquetMetadataFromDuck(
  duck: GeoParquetMetadataReader,
  escapedFileId: string,
  failureMessage = 'Failed to read GeoParquet metadata'
): Promise<GeoParquetMeta | null> {
  try {
    const result = (await duck.query(
      `SELECT value FROM parquet_kv_metadata('${escapedFileId}') WHERE key = 'geo'`,
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
