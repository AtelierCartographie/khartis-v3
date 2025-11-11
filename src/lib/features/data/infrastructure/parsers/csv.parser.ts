import Papa from 'papaparse';
import type { IParser } from '../../domain/interfaces/parser.interface';
import { ParserError } from '../../domain/interfaces/parser.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import type { RawColumn } from '../../domain/entities/raw-column.entity';

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
 * console.log(dataset.headers); // ['name', 'age', 'city']
 * console.log(dataset.rows[0]); // ['John', '25', 'Paris']
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
      console.log('[CSVParser] Parsing file:', file.name, 'size:', file.size, 'type:', file.type);

      Papa.parse(file, {
        header: true,
        dynamicTyping: false, // Keep as strings - type inference done later
        skipEmptyLines: true,
        quoteChar: '"',
        escapeChar: '"',
        complete: (results) => {
          try {
            console.log('[CSVParser] Parse complete. Errors:', results.errors.length, 'Meta:', results.meta);

            if (results.errors.length > 0) {
              console.error('[CSVParser] Parse errors:', results.errors);
              const error = results.errors[0];
              throw new ParserError(
                `CSV parsing error at row ${error.row}: ${error.message}`,
                error,
                'csv'
              );
            }

            const headers = results.meta.fields || [];
            console.log('[CSVParser] Headers found:', headers);

            if (headers.length === 0) {
              throw new ParserError(
                'No headers found in CSV file',
                undefined,
                'csv'
              );
            }

            const dataRows = results.data as Record<string, unknown>[];

            // Convert to row-oriented format
            const rows: unknown[][] = dataRows.map((row) =>
              headers.map((header) => row[header] ?? null)
            );

            // Convert to column-oriented format
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
