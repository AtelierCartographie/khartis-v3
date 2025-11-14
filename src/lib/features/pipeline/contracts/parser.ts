import type { RawDataset } from '../models/raw-dataset';

/**
 * Parser interface - Strategy pattern
 *
 * Responsibility: Convert File to RawDataset
 *
 * Each parser implementation handles ONE file format (CSV, GeoJSON, Shapefile, etc.)
 * Parsers are collected via `createParserList` and the pipeline picks the first
 * parser whose `canParse` method returns true.
 *
 * @example
 * ```typescript
 * class CSVParser implements IParser {
 *   readonly supportedExtensions = ['.csv', '.tsv'];
 *   readonly mimeTypes = ['text/csv'];
 *
 *   canParse(file: File): boolean {
 *     return this.supportedExtensions.includes(file.name.split('.').pop());
 *   }
 *
 *   async parse(file: File): Promise<RawDataset> {
 *     return parseCsv(file);
 *   }
 * }
 * ```
 */
export interface IParser {
  /**
   * File extensions this parser supports (e.g., ['.csv', '.tsv'])
   */
  readonly supportedExtensions: string[];

  /**
   * MIME types this parser supports (e.g., ['text/csv'])
   */
  readonly mimeTypes: string[];

  /**
   * Check if this parser can handle the given file
   *
   * @param file - File to check
   * @returns true if parser can handle this file
   */
  canParse(file: File): boolean;

  /**
   * Parse file to RawDataset
   *
   * @param file - File to parse
   * @returns RawDataset with headers, rows, and metadata
   * @throws ParserError if parsing fails
   */
  parse(file: File): Promise<RawDataset>;
}

/**
 * Parser error - thrown when parsing fails
 */
export class ParserError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly fileType?: string
  ) {
    super(message);
    this.name = 'ParserError';
  }
}
