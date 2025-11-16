import type { IParser } from '../../contracts/parser';
import { CSVParser } from './csv.parser';
import { GeoJSONParser } from './geojson.parser';
import { ShapefileParser } from './shapefile.parser';
import { GeoPackageParser } from './geopackage.parser';
import { KMLParser } from './kml.parser';
import { GeoParquetParser } from './geoparquet.parser';

export type ParserList = ReadonlyArray<IParser>;

const baseParsers: ParserList = Object.freeze([
  new CSVParser(),
  new GeoJSONParser(),
  new ShapefileParser(),
  new GeoPackageParser(),
  new KMLParser(),
  new GeoParquetParser()
]);

export function createParserList(overrides?: ParserList): ParserList {
  return overrides ? [...overrides] : [...baseParsers];
}

export function findParser(file: File, parsers: ParserList): IParser | null {
  return parsers.find((parser) => parser.canParse(file)) ?? null;
}

export function getSupportedExtensions(parsers: ParserList): string[] {
  const extensions = new Set<string>();
  parsers.forEach((parser) => {
    parser.supportedExtensions.forEach((ext) => extensions.add(ext));
  });
  return Array.from(extensions).sort();
}

export function getSupportedMimeTypes(parsers: ParserList): string[] {
  const mimes = new Set<string>();
  parsers.forEach((parser) => {
    parser.mimeTypes.forEach((mime) => mimes.add(mime));
  });
  return Array.from(mimes).sort();
}
