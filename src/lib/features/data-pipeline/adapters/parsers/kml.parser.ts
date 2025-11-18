import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import type {
  GeoJSONFeatureCollection,
  GeoJSONFeature
} from './geojson.parser';
import { convertGeoJSONToRawDataset } from './geojson.parser';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import JSZip from 'jszip';
import type { FeatureCollection, Feature } from 'geojson';

/**
 * KML/KMZ Parser - converts Google Earth files to RawDataset via GeoJSON.
 */
export class KMLParser implements IParser {
  readonly supportedExtensions = ['.kml', '.kmz'];

  readonly mimeTypes = [
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz'
  ];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    try {
      const start = performance.now();
      logger.info('Parsing KML/KMZ file', LogCategory.DATA, {
        fileName: file.name
      });
      const geojson = await convertKMLFileToGeoJSON(file);
      const dataset = convertGeoJSONToRawDataset(geojson);
      logger.success('KML/KMZ parsed', LogCategory.DATA, {
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

      logger.error('KML/KMZ parsing failed', LogCategory.DATA, error);
      throw new ParserError(
        `Failed to parse KML/KMZ: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        'kml'
      );
    }
  }
}

export async function convertKMLFileToGeoJSON(
  file: File
): Promise<GeoJSONFeatureCollection> {
  const xmlString = await (file.name.toLowerCase().endsWith('.kmz')
    ? extractKMZ(file)
    : file.text());

  return convertXMLToGeoJSON(xmlString);
}

async function extractKMZ(file: File): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(file);
    const entries = zip.filter((relativePath) =>
      relativePath.toLowerCase().endsWith('.kml')
    );

    if (entries.length === 0) {
      throw new ParserError(
        'KMZ archive does not contain a KML file',
        undefined,
        'kml'
      );
    }

    return entries[0].async('string');
  } catch (error) {
    if (error instanceof ParserError) {
      throw error;
    }
    throw new ParserError(
      `Unable to extract KMZ archive: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error,
      'kml'
    );
  }
}

function convertXMLToGeoJSON(xmlString: string): GeoJSONFeatureCollection {
  if (typeof DOMParser === 'undefined') {
    throw new ParserError(
      'DOMParser is not available in this environment.',
      undefined,
      'kml'
    );
  }

  const dom = new DOMParser().parseFromString(xmlString, 'text/xml');
  const parserError = dom.getElementsByTagName('parsererror');
  if (parserError.length > 0) {
    throw new ParserError(
      'Invalid KML file: XML parsing failed',
      undefined,
      'kml'
    );
  }

  const geojson = kmlToGeoJSON(dom) as FeatureCollection;
  if (!geojson || geojson.type !== 'FeatureCollection') {
    throw new ParserError('KML did not produce any features', undefined, 'kml');
  }

  return normalizeGeoJSONFeatureCollection(geojson);
}

function normalizeGeoJSONFeatureCollection(
  geojson: FeatureCollection
): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geojson.features.map((feature) =>
      normalizeGeoJSONFeature(feature)
    )
  };
}

function normalizeGeoJSONFeature(feature: Feature): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: feature.geometry ?? undefined,
    properties: feature.properties ?? undefined
  };
}
