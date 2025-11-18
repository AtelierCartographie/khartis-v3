import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import type { RawColumn } from '../../models/raw-column';
import type { GeometryInfo } from '../../models/geometry-info';
import { computeCentroid } from '../../models/geometry-info';
import { geoParquetReader } from '../readers/GeoParquetReader';
import {
  extractBBox,
  extractPrimaryGeometryType,
  type GeoArrowMetadata
} from '../../models/geo-arrow-metadata';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import type { Table } from 'apache-arrow/Arrow';

/**
 * GeoParquet Parser - converts GeoParquet files (with GeoArrow metadata)
 * into RawDataset objects for the data pipeline.
 */
export class GeoParquetParser implements IParser {
  readonly supportedExtensions = ['.geoparquet', '.gpq', '.parquet'];

  readonly mimeTypes = ['application/geoparquet', 'application/x-parquet'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    try {

      const buffer = await file.arrayBuffer();
      const arrowTable = await geoParquetReader.readGeoParquet(buffer);
      const geoMetadata = geoParquetReader.extractMetadata(arrowTable);

      const dataset = this.convertArrowTable(arrowTable, geoMetadata);
      return dataset;
    } catch (error) {
      if (error instanceof ParserError) {
        throw error;
      }

      throw new ParserError(
        `Failed to parse GeoParquet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        'geoparquet'
      );
    }
  }

  private convertArrowTable(
    table: Table,
    metadata: GeoArrowMetadata | null
  ): RawDataset {
    const headers = table.schema.fields.map((field) => field.name);
    const rows: unknown[][] = [];

    for (let i = 0; i < table.numRows; i += 1) {
      const record = table.get(i) as Record<string, unknown>;
      const row = headers.map((header) => record?.[header] ?? null);
      rows.push(row);
    }

    const columns: RawColumn[] = headers.map((name, colIndex) => ({
      name,
      values: rows.map((row) => row[colIndex])
    }));

    return {
      headers,
      rows,
      columns,
      geometry: this.buildGeometryInfo(metadata, table.numRows),
      metadata: {
        fileType: 'geoparquet',
        rowCount: rows.length,
        columnCount: headers.length,
        geoMetadata: metadata ?? undefined
      }
    };
  }

  private buildGeometryInfo(
    metadata: GeoArrowMetadata | null,
    rowCount: number
  ): GeometryInfo | undefined {
    if (!metadata) return undefined;

    const bbox = extractBBox(metadata);
    if (!bbox) return undefined;

    const geometryType = extractPrimaryGeometryType(metadata) || 'Unknown';

    const primaryColumn = metadata.primary_column;
    const crsMetadata = metadata.columns[primaryColumn]?.crs;
    const crsName =
      crsMetadata?.name ||
      (crsMetadata?.id
        ? `${crsMetadata.id.authority}:${crsMetadata.id.code}`
        : undefined);

    return {
      type: geometryType,
      bounds: bbox,
      centroid: computeCentroid(bbox),
      crs: crsName,
      featureCount: rowCount
    };
  }
}
