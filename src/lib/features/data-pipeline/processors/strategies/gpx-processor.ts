import { MIME } from '$lib/features/commons/constants';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import type { GeoJSONFeatureCollection } from '$lib/types/data';
import * as m from '$lib/paraglide/messages';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';
import { buildProcessorDataset } from './processor-utils';

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

async function readGpxContent(file: UploadedFile): Promise<string> {
  const textReader = Reflect.get(file, 'text');
  if (typeof textReader === 'function') {
    const content = await Promise.resolve(textReader.call(file));
    if (typeof content === 'string') {
      return content;
    }
  }

  if (file.originalFile) {
    return file.originalFile.text();
  }

  if (typeof file.content === 'string') {
    return file.content;
  }

  if (file.content instanceof ArrayBuffer) {
    return new TextDecoder().decode(file.content);
  }

  throw new ParseError(m.error_gpx_missing_content(), FileType.GPX, {
    fileId: file.id,
    fileName: file.name
  });
}

export const gpxProcessor: FileProcessor = {
  supportedFileTypes: [FileType.GPX],

  canHandle(file: UploadedFile): boolean {
    return (
      file.fileType === FileType.GPX || file.name.toLowerCase().endsWith('.gpx')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    const rawContent = await readGpxContent(file);
    const geojson = parseGpxToGeoJson(rawContent);
    const geojsonFile = new File(
      [JSON.stringify(geojson)],
      file.name.replace(GPX_FILE_EXTENSION_REGEX, '.geojson'),
      { type: MIME.GEOJSON }
    );

    await ctx.Duck.register_files([geojsonFile]);

    const resultTableName = await ctx.Duck.read_geofile(geojsonFile, {
      tablename: ctx.tableName
    });
    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : ctx.tableName;

    return buildProcessorDataset(ctx, file, actualTableName);
  }
};
