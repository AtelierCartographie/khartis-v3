import type { IParser } from '../../domain/interfaces/parser.interface';
import { CSVParser } from './csv.parser';
import { GeoJSONParser } from './geojson.parser';
import { ShapefileParser } from './shapefile.parser';
import { GeoPackageParser } from './geopackage.parser';
import { KMLParser } from './kml.parser';
import { GeoParquetParser } from './geoparquet.parser';

/**
 * Parser Registry - Finds the right parser for a file
 *
 * Manages a collection of parsers and matches files to appropriate parser.
 * Uses Strategy pattern - each parser knows what it can handle.
 *
 * @example
 * ```typescript
 * const registry = new ParserRegistry();
 *
 * // Find parser for file
 * const parser = registry.findParser(csvFile);
 * if (parser) {
 *   const dataset = await parser.parse(csvFile);
 * }
 *
 * // Register custom parser
 * registry.register(new CustomParser());
 * ```
 */
export class ParserRegistry {
  private parsers: IParser[] = [];

  constructor() {
    this.registerDefaults();
  }

  /**
   * Register default parsers (CSV, GeoJSON, Shapefile)
   */
  private registerDefaults(): void {
    this.register(new CSVParser());
    this.register(new GeoJSONParser());
    this.register(new ShapefileParser());
    this.register(new GeoPackageParser());
    this.register(new KMLParser());
    this.register(new GeoParquetParser());
  }

  /**
   * Register a parser
   *
   * Parsers are checked in registration order.
   * Register more specific parsers first.
   *
   * @param parser - Parser to register
   */
  register(parser: IParser): void {
    this.parsers.push(parser);
  }

  /**
   * Find parser that can handle the given file
   *
   * Returns first parser where canParse() returns true.
   *
   * @param file - File to find parser for
   * @returns Parser that can handle file, or null
   */
  findParser(file: File): IParser | null {
    return this.parsers.find((parser) => parser.canParse(file)) || null;
  }

  /**
   * Get all supported file extensions across all parsers
   *
   * @returns Array of extensions (e.g., ['.csv', '.geojson', '.shp'])
   */
  getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    this.parsers.forEach((parser) => {
      parser.supportedExtensions.forEach((ext) => extensions.add(ext));
    });
    return Array.from(extensions).sort();
  }

  /**
   * Get all supported MIME types across all parsers
   *
   * @returns Array of MIME types
   */
  getSupportedMimeTypes(): string[] {
    const mimes = new Set<string>();
    this.parsers.forEach((parser) => {
      parser.mimeTypes.forEach((mime) => mimes.add(mime));
    });
    return Array.from(mimes).sort();
  }

  /**
   * Get all registered parsers
   *
   * @returns Array of parsers
   */
  getParsers(): IParser[] {
    return [...this.parsers];
  }

  /**
   * Clear all parsers
   */
  clear(): void {
    this.parsers = [];
  }
}
