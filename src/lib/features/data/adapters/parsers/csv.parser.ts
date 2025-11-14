import Papa from 'papaparse';
import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import type { RawColumn } from '../../models/raw-column';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

/**
 * CSV Parser - Parses CSV/TSV files using PapaParse
 *
 * Supports:
 * - CSV (comma-separated)
 * - TSV (tab-separated)
 * - Custom delimiters (auto-detected)
 *
 * @example
 * ```typescript
 * const parser = new CSVParser();
 * const dataset = await parser.parse(csvFile);
 * ```
 */
export class CSVParser implements IParser {
  readonly supportedExtensions = ['.csv', '.tsv', '.txt'];

  readonly mimeTypes = ['text/csv', 'text/tab-separated-values', 'text/plain'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const hasValidExtension = this.supportedExtensions.includes(ext);
    const hasValidMime = this.mimeTypes.some((mime) =>
      file.type.includes(mime)
    );

    return hasValidExtension || hasValidMime;
  }

  async parse(file: File): Promise<RawDataset> {
    return new Promise((resolve, reject) => {
      logger.debug('Operation', LogCategory.DATA);

      Papa.parse(file, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        quoteChar: '"',
        escapeChar: '"',
        complete: (results) => {
          try {
            logger.debug('Operation', LogCategory.DATA);

            if (results.errors.length > 0) {
              logger.error('Operation', LogCategory.DATA);
              const error = results.errors[0];
              throw new ParserError(
                `CSV parsing error at row ${error.row}: ${error.message}`,
                error,
                'csv'
              );
            }

            const headers = results.meta.fields || [];
            logger.debug('Operation', LogCategory.DATA);

            if (headers.length === 0) {
              throw new ParserError(
                'No headers found in CSV file',
                undefined,
                'csv'
              );
            }

            const dataRows = results.data as Record<string, unknown>[];

            const rows: unknown[][] = dataRows.map((row) =>
              headers.map((header) => row[header] ?? null)
            );

            const columns: RawColumn[] = headers.map((name) => ({
              name,
              values: dataRows.map((row) => row[name] ?? null)
            }));

            resolve({
              headers,
              rows,
              columns,
              metadata: {
                delimiter: results.meta.delimiter,
                linebreak: results.meta.linebreak,
                rowCount: rows.length,
                columnCount: headers.length,
                fileType: 'csv'
              }
            });
          } catch (error) {
            if (error instanceof ParserError) {
              reject(error);
            } else {
              reject(
                new ParserError(
                  `Failed to process CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  error,
                  'csv'
                )
              );
            }
          }
        },
        error: (error) => {
          reject(
            new ParserError(
              `CSV parsing failed: ${error.message}`,
              error,
              'csv'
            )
          );
        }
      });
    });
  }
}
