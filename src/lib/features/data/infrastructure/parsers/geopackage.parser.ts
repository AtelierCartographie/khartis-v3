import type { IParser } from '../../domain/interfaces/parser.interface';
import { ParserError } from '../../domain/interfaces/parser.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import {
  convertGeoJSONToRawDataset,
  type GeoJSONFeatureCollection
} from './geojson.parser';
import { parseGeoPackage } from '$lib/features/commons/utils/file-import.utils';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

/**
 * GeoPackage Parser - converts GeoPackage files to RawDataset.
 *
 * Relies on the sql.js-based `parseGeoPackage` helper that returns
 * a GeoJSON FeatureCollection, then reuses the GeoJSON pipeline
 * to keep metadata and geometry handling consistent.
 */
export class GeoPackageParser implements IParser {
  readonly supportedExtensions = ['.gpkg'];

  readonly mimeTypes = [
    'application/geopackage+sqlite3',
    'application/octet-stream'
  ];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    try {
      logger.debug('Parsing GeoPackage file', LogCategory.DATA, {
        name: file.name,
        size: file.size
      });

      const buffer = await file.arrayBuffer();
      const geojson = (await parseGeoPackage(
        buffer
      )) as GeoJSONFeatureCollection;

      return convertGeoJSONToRawDataset(geojson);
    } catch (error) {
      logger.error('GeoPackage parsing failed', LogCategory.DATA, error);
      throw new ParserError(
        `Failed to parse GeoPackage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        'geopackage'
      );
    }
  }
}
