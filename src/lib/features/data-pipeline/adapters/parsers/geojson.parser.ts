import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import {
  convertGeoJSONToRawDataset,
  type GeoJSONFeatureCollection
} from '../../utils/geojson-converter';

// Re-export for backwards compatibility
export { convertGeoJSONToRawDataset } from '../../utils/geojson-converter';
export type {
  GeoJSONFeature,
  GeoJSONFeatureCollection
} from '../../utils/geojson-converter';

/**
 * Parses GeoJSON files into a raw dataset with geometry metadata.
 */
export class GeoJSONParser implements IParser {
  readonly supportedExtensions = ['.geojson', '.json'];

  readonly mimeTypes = ['application/geo+json', 'application/json'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    try {
      const start = performance.now();
      logger.info('Parsing GeoJSON file', LogCategory.DATA, {
        fileName: file.name
      });

      const text = await file.text();
      const geojson: GeoJSONFeatureCollection = JSON.parse(text);

      if (geojson.type !== 'FeatureCollection') {
        throw new ParserError(
          'Invalid GeoJSON: must be a FeatureCollection',
          undefined,
          'geojson'
        );
      }

      if (!Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new ParserError(
          'Invalid GeoJSON: features array is empty or missing',
          undefined,
          'geojson'
        );
      }

      const dataset = convertGeoJSONToRawDataset(geojson);

      logger.success('GeoJSON parsed', LogCategory.DATA, {
        fileName: file.name,
        rows: dataset.rows.length,
        columns: dataset.columns.length,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return dataset;
    } catch (error) {
      if (error instanceof ParserError) {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new ParserError('Invalid JSON syntax', error, 'geojson');
      }

      throw new ParserError(
        `Failed to parse GeoJSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        'geojson'
      );
    }
  }
}
