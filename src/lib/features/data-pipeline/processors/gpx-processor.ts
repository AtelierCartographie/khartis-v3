import { MIME } from '$lib/features/commons/constants';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import { FileType } from '$lib/features/commons/types/create-project.types';
import { Duck } from '$lib/features/duckdb';
import type { GeoJSONFeatureCollection } from '$lib/types/data';
import * as m from '$lib/paraglide/messages';

const GPX_POINT_TAGS = new Set(['wpt', 'rtept', 'trkpt']);
const GPX_FILE_EXTENSION_REGEX = /\.gpx$/i;

function addProperty(
  properties: Record<string, string | string[]>,
  key: string,
  value: string
): void {
  const existing = properties[key];
  if (existing === undefined) {
    properties[key] = value;
    return;
  }

  if (Array.isArray(existing)) {
    if (!existing.includes(value)) {
      existing.push(value);
    }
    return;
  }

  if (existing !== value) {
    properties[key] = [existing, value];
  }
}

function collectLeafProperties(
  element: Element,
  properties: Record<string, string | string[]>
): void {
  for (const child of Array.from(element.children)) {
    if (child.children.length > 0) {
      collectLeafProperties(child, properties);
      continue;
    }

    const value = child.textContent?.trim() ?? '';
    if (!value) continue;

    addProperty(properties, child.localName, value);
  }
}

function parseGpxToGeoJson(content: string): GeoJSONFeatureCollection {
  const doc = new DOMParser().parseFromString(content, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ParseError(m.error_gpx_extraction_failed(), FileType.GPX);
  }

  const features: GeoJSONFeatureCollection['features'] = [];

  for (const element of Array.from(doc.getElementsByTagNameNS('*', '*'))) {
    const pointTag = element.localName.toLowerCase();
    if (!GPX_POINT_TAGS.has(pointTag)) continue;

    const lat = Number.parseFloat(element.getAttribute('lat') ?? '');
    const lon = Number.parseFloat(element.getAttribute('lon') ?? '');

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const properties: Record<string, string | string[]> = {};
    collectLeafProperties(element, properties);
    properties.gpx_point_type = pointTag;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      },
      properties
    });
  }

  if (features.length === 0) {
    throw new ParseError(m.error_gpx_extraction_failed(), FileType.GPX);
  }

  return {
    type: 'FeatureCollection',
    features
  };
}

export function isGpxFile(fileName: string): boolean {
  return GPX_FILE_EXTENSION_REGEX.test(fileName);
}

/**
 * GPX is the one format DuckDB cannot read: the points are converted to a
 * GeoJSON file that the spatial reader then loads. Returns the table name.
 */
export async function readGpxIntoTable(
  file: File,
  tableName: string,
  originalName: string = file.name
): Promise<string> {
  const geojson = parseGpxToGeoJson(await file.text());
  const geojsonFile = new File(
    [JSON.stringify(geojson)],
    originalName.replace(GPX_FILE_EXTENSION_REGEX, '.geojson'),
    { type: MIME.GEOJSON }
  );

  await Duck.register_files([geojsonFile]);

  const resultTableName = await Duck.read_geofile(geojsonFile, {
    tablename: tableName
  });
  return typeof resultTableName === 'string' ? resultTableName : tableName;
}
