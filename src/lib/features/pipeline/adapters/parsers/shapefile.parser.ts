import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import type {
  GeoJSONFeatureCollection,
  GeoJSONFeature
} from './geojson.parser';
import { convertGeoJSONToRawDataset } from './geojson.parser';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import shp from 'shpjs';
import type shpjs from 'shpjs';
import type { Feature as GeoJSONLibFeature } from 'geojson';

/**
 * Shapefile Parser
 *
 * Accepts zipped shapefiles (recommended) and transforms them into the
 * internal RawDataset structure by converting the geometry to GeoJSON.
 * Bare .shp uploads without their companion files are rejected with an
 * explicit error explaining how to proceed.
 */
export class ShapefileParser implements IParser {
  readonly supportedExtensions = ['.shp', '.zip'];

  readonly mimeTypes = ['application/x-shapefile', 'application/zip'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    try {
      logger.debug('Parsing shapefile', LogCategory.DATA, {
        name: file.name,
        size: file.size,
        type: file.type
      });

      const geojson = await this.toGeoJSON(file);
      return convertGeoJSONToRawDataset(geojson);
    } catch (error) {
      if (error instanceof ParserError) {
        throw error;
      }

      logger.error('Failed to parse shapefile', LogCategory.DATA, error);
      throw new ParserError(
        `Failed to parse shapefile: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        'shapefile'
      );
    }
  }

  private async toGeoJSON(file: File): Promise<GeoJSONFeatureCollection> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'zip') {
      return this.parseZipShapefile(file);
    }

    if (extension === 'shp') {
      return this.parseLooseComponents(file);
    }

    throw new ParserError(
      `Unsupported shapefile extension ".${extension}"`,
      undefined,
      'shapefile'
    );
  }

  private async parseZipShapefile(
    file: File
  ): Promise<GeoJSONFeatureCollection> {
    const buffer = await file.arrayBuffer();
    type ShpResult =
      | shpjs.FeatureCollectionWithFilename
      | shpjs.FeatureCollectionWithFilename[];
    const result = (await shp(buffer)) as ShpResult;

    if (Array.isArray(result)) {
      if (result.length === 0) {
        throw new ParserError(
          'Shapefile archive does not contain any layers',
          undefined,
          'shapefile'
        );
      }
      return this.normalizeFeatureCollection(result[0]);
    }

    return this.normalizeFeatureCollection(result);
  }

  private async parseLooseComponents(
    _file: File
  ): Promise<GeoJSONFeatureCollection> {
    throw new ParserError(
      'Incomplete shapefile provided. Upload the zipped bundle (.zip) that contains .shp/.dbf/.shx/.prj files.',
      undefined,
      'shapefile'
    );
  }

  private normalizeFeatureCollection(
    collection: shpjs.FeatureCollectionWithFilename
  ): GeoJSONFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: collection.features.map((feature) =>
        this.normalizeFeature(feature)
      )
    };
  }

  private normalizeFeature(feature: GeoJSONLibFeature): GeoJSONFeature {
    return {
      type: 'Feature',
      geometry: feature.geometry ?? null,
      properties: feature.properties ?? undefined
    };
  }
}
