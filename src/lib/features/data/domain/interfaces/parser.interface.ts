import type { RawDataset } from '../entities/raw-dataset.entity';

/**
 * Parser interface - Strategy pattern
 *
 * Responsibility: Convert File to RawDataset
 *
 * Each parser implementation handles ONE file format (CSV, GeoJSON, Shapefile, etc.)
 * Parsers are registered in ParserRegistry and selected based on file type.
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
 *     // Parse CSV to RawDataset
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
