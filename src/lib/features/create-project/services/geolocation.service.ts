import type { GeoColumnDetection } from '../types/basemap.types';
import type { ColumnInfo } from '$lib/features/commons/services/duckdb/types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export class GeolocationService {
  static detectGeoColumns(columns: ColumnInfo[]): GeoColumnDetection {
    const latitudeCol = this.findLatitudeColumn(columns);
    const longitudeCol = this.findLongitudeColumn(columns);
    const locationCol = this.findLocationColumn(columns);
    const codeCol = this.findGeoCodeColumn(columns);

    let detectedType: 'coordinates' | 'location_name' | 'geo_code' | undefined;

    if (latitudeCol && longitudeCol) {
      detectedType = 'coordinates';
    } else if (codeCol) {
      detectedType = 'geo_code';
    } else if (locationCol) {
      detectedType = 'location_name';
    }

    const result: GeoColumnDetection = {
      hasGeoColumns: !!(latitudeCol || longitudeCol || locationCol || codeCol),
      latitudeColumn: latitudeCol,
      longitudeColumn: longitudeCol,
      locationColumn: locationCol,
      geoCodeColumn: codeCol,
      detectedType
    };

    logger.info('Geo columns detected', LogCategory.DATA, result);

    return result;
  }

  private static findLatitudeColumn(columns: ColumnInfo[]): string | undefined {
    const latPatterns = /^(lat|latitude|y|ycoord|y_coord)$/i;
    return columns.find(
      (col) => latPatterns.test(col.name) && col.type_js === 'number'
    )?.name;
  }

  private static findLongitudeColumn(
    columns: ColumnInfo[]
  ): string | undefined {
    const lonPatterns = /^(lon|long|longitude|x|xcoord|x_coord)$/i;
    return columns.find(
      (col) => lonPatterns.test(col.name) && col.type_js === 'number'
    )?.name;
  }

  private static findLocationColumn(columns: ColumnInfo[]): string | undefined {
    const locationPatterns =
      /^(city|ville|town|location|place|address|locality|commune|region|country|pays)$/i;
    return columns.find(
      (col) => locationPatterns.test(col.name) && col.type_js === 'string'
    )?.name;
  }

  private static findGeoCodeColumn(columns: ColumnInfo[]): string | undefined {
    const codePatterns =
      /^(iso|iso3|iso2|nuts|nuts_id|code|geo_code|region_code|country_code|code_geo|code_insee)$/i;
    return columns.find(
      (col) => codePatterns.test(col.name) && col.type_js === 'string'
    )?.name;
  }

  static detectGeoCodePattern(values: string[]): string | undefined {
    if (values.length === 0) return undefined;

    const sampleSize = Math.min(10, values.length);
    const samples = values.slice(0, sampleSize).filter((v) => v && v.trim());

    if (samples.length === 0) return undefined;

    const firstValue = samples[0];

    if (/^[A-Z]{2}\d{1,3}$/.test(firstValue)) {
      return 'NUTS';
    }

    if (/^[A-Z]{2,3}$/.test(firstValue)) {
      return 'ISO';
    }

    if (/^(FR|fr)\d{2,5}$/.test(firstValue)) {
      return 'INSEE';
    }

    if (/^\d{2,5}$/.test(firstValue)) {
      return 'NUMERIC_CODE';
    }

    return undefined;
  }

  static async analyzeGeoColumn(
    datasetId: string,
    columnName: string
  ): Promise<{
    pattern?: string;
    uniqueValues: number;
    sampleValues: string[];
    bbox?: [number, number, number, number];
  }> {
    try {
      logger.info('Analyzing geo column', LogCategory.DATA, {
        datasetId,
        columnName
      });

      return {
        uniqueValues: 0,
        sampleValues: []
      };
    } catch (error) {
      logger.error('Failed to analyze geo column', LogCategory.DATA, error);
      throw error;
    }
  }
}
