import { ParseError } from '$lib/features/commons/errors/pipeline.errors';
import { MIME } from '$lib/features/commons/constants';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import type { GeoJSONFeatureCollection } from '$lib/types/data';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';

const GPX_POINT_TAG_REGEX = /<(wpt|rtept|trkpt)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const XML_ATTRIBUTE_REGEX = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;
const XML_LEAF_TAG_REGEX =
  /<([A-Za-z_][\w:.-]*)>([^<]*)<\/([A-Za-z_][\w:.-]*)>/g;
const GPX_FILE_EXTENSION_REGEX = /\.gpx$/i;

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function toPropertyKey(tagName: string): string {
  const [, localName = tagName] = tagName.split(':');
  return localName.trim();
}

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

function parseAttributes(attributeBlock: string): Map<string, string> {
  const attributes = new Map<string, string>();

  for (const match of attributeBlock.matchAll(XML_ATTRIBUTE_REGEX)) {
    const [, rawName = '', rawValue = ''] = match;
    attributes.set(rawName.toLowerCase(), decodeXmlEntities(rawValue.trim()));
  }

  return attributes;
}

function extractLeafProperties(
  xmlBlock: string
): Record<string, string | string[]> {
  const properties: Record<string, string | string[]> = {};

  for (const match of xmlBlock.matchAll(XML_LEAF_TAG_REGEX)) {
    const [, openTag = '', rawValue = '', closeTag = ''] = match;
    if (openTag !== closeTag) continue;

    const value = decodeXmlEntities(rawValue.trim());
    if (!value) continue;

    addProperty(properties, toPropertyKey(openTag), value);
  }

  return properties;
}

function parseGpxToGeoJson(content: string): GeoJSONFeatureCollection {
  const features: GeoJSONFeatureCollection['features'] = [];

  for (const match of content.matchAll(GPX_POINT_TAG_REGEX)) {
    const [, pointType = '', attributeBlock = '', innerXml = ''] = match;
    const attributes = parseAttributes(attributeBlock);
    const lat = Number.parseFloat(attributes.get('lat') ?? '');
    const lon = Number.parseFloat(attributes.get('lon') ?? '');

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const properties = extractLeafProperties(innerXml);
    properties.gpx_point_type = pointType.toLowerCase();

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
    throw new ParseError('Unable to extract GPX points', FileType.GPX);
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

  throw new ParseError('Missing GPX content', FileType.GPX, {
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
    const start = performance.now();
    logger.debug('Processing GPX file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName: ctx.tableName
    });

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

    const [columns, rowCount, { arrowTableWithMetadata, geoArrowMetadata }] =
      await Promise.all([
        ctx.Duck.analyse(actualTableName),
        ctx.callbacks.getRowCount(actualTableName),
        ctx.callbacks.createArrowTableWithMetadata(actualTableName)
      ]);

    const dataset: ProcessorDataset = {
      id: file.datasetId ?? file.id,
      tableName: actualTableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: file.fileType
      },
      geoDetection: file.deepAnalysis?.geoDetection,
      arrowTableWithMetadata,
      geoArrowMetadata: geoArrowMetadata ?? undefined
    };

    logger.success('GPX processed', LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      rowCount: dataset.rowCount,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return dataset;
  }
};
