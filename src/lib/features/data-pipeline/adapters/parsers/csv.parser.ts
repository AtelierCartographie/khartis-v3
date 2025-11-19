import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { csvWorkerService } from '$lib/features/workers/csv-worker.service';

/**
 * CSV Parser - Parses CSV/TSV files using Web Workers for improved performance
 *
 * Supports:
 * - CSV (comma-separated)
 * - TSV (tab-separated)
 * - Custom delimiters (auto-detected)
 * - Large files processing in background thread
 * - Automatic fallback to main thread if workers fail
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

  private useWorker = true; // Flag to enable/disable worker usage

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const hasValidExtension = this.supportedExtensions.includes(ext);
    const hasValidMime = this.mimeTypes.some((mime) =>
      file.type.includes(mime)
    );

    return hasValidExtension || hasValidMime;
  }

  async parse(file: File): Promise<RawDataset> {
    const start = performance.now();
    logger.info('Parsing CSV/TSV file', LogCategory.DATA, {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      useWorker: this.useWorker
    });

    try {
      // Determine delimiter hint for TSV files
      const delimiter = file.name.toLowerCase().endsWith('.tsv') ? '\t' : undefined;

      // Use worker for large files or when enabled
      const shouldUseWorker = this.useWorker && (file.size > 1024 * 1024 || this.useWorker); // 1MB threshold

      if (shouldUseWorker) {
        logger.debug('Using Web Worker for CSV parsing', LogCategory.DATA, {
          fileName: file.name,
          fileSize: file.size
        });

        // Parse using worker service
        const dataset = await csvWorkerService.parseFile(file, {
          delimiter,
          onProgress: (progress) => {
            logger.debug(`CSV parsing progress: ${progress.toFixed(0)}%`, LogCategory.DATA);
          }
        });

        // Validate results
        if (!dataset.headers || dataset.headers.length === 0) {
          throw new ParserError(
            'No headers found in CSV file',
            undefined,
            'csv'
          );
        }

        logger.success('CSV parsed successfully using Worker', LogCategory.DATA, {
          fileName: file.name,
          rows: dataset.rows.length,
          columns: dataset.headers.length,
          durationMs: (performance.now() - start).toFixed(2)
        });

        return {
          ...dataset,
          metadata: {
            ...dataset.metadata,
            fileType: 'csv',
            parsedWithWorker: true
          }
        };
      } else {
        // Fallback to main thread parsing
        return this.parseMainThread(file, start);
      }
    } catch (error) {
      if (error instanceof ParserError) {
        throw error;
      } else {
        logger.error('CSV parsing failed', LogCategory.DATA, {
          fileName: file.name,
          error
        });
        throw new ParserError(
          `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error,
          'csv'
        );
      }
    }
  }

  /**
   * Parse file on main thread (fallback method)
   */
  private async parseMainThread(file: File, startTime: number): Promise<RawDataset> {
    // Dynamically import PapaParse only when needed
    const Papa = (await import('papaparse')).default;

    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        quoteChar: '"',
        escapeChar: '"',
        complete: (results) => {
          try {
            if (results.errors.length > 0) {
              const error = results.errors[0];
              logger.error('CSV parsing error', LogCategory.DATA, {
                fileName: file.name,
                row: error.row,
                type: error.type,
                code: error.code
              });
              throw new ParserError(
                `CSV parsing error at row ${error.row}: ${error.message}`,
                error,
                'csv'
              );
            }

            const headers = results.meta.fields || [];

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

            const columns = headers.map((name) => ({
              name,
              values: dataRows.map((row) => row[name] ?? null)
            }));

            logger.success('CSV parsed successfully on main thread', LogCategory.DATA, {
              fileName: file.name,
              rows: rows.length,
              columns: headers.length,
              durationMs: (performance.now() - startTime).toFixed(2)
            });

            resolve({
              headers,
              rows,
              columns,
              metadata: {
                delimiter: results.meta.delimiter,
                linebreak: results.meta.linebreak,
                rowCount: rows.length,
                columnCount: headers.length,
                fileType: 'csv',
                parsedWithWorker: false
              }
            });
          } catch (error) {
            if (error instanceof ParserError) {
              reject(error);
            } else {
              logger.error('Unexpected CSV parsing failure', LogCategory.DATA, {
                fileName: file.name,
                error
              });
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
          logger.error('CSV parsing failed', LogCategory.DATA, {
            fileName: file.name,
            error
          });
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

  /**
   * Set whether to use Web Workers for parsing
   */
  public setUseWorker(useWorker: boolean): void {
    this.useWorker = useWorker;
  }
}
