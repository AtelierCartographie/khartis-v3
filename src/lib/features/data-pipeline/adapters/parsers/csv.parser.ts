import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';

/**
 * Parses CSV/TSV files using DuckDB's native read_csv() for fast WASM ingestion.
 * DuckDB handles delimiter detection, type inference, and header normalization.
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
    const start = performance.now();
    logger.info('Parsing CSV/TSV with DuckDB', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size
    });

    let tableName: string | undefined;

    try {
      await initDuckDB();
      if (!Duck) {
        throw new DuckDBError('DuckDB not initialized');
      }

      // Generate unique table name
      const baseTableName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      tableName = `csv_${baseTableName}_${Date.now()}`;

      // Single call to DuckDB - it handles everything (delimiter, types, headers)
      await Duck.read_tabular(file, { tablename: tableName });

      // Get metadata using Duck's cached methods
      const tableInfo = await Duck.describe_table(tableName);
      const rowCount = await Duck.get_row_count(tableName);
      const headers = tableInfo.name;

      // Determine delimiter for metadata (TSV vs CSV)
      const isTsv = file.name.toLowerCase().endsWith('.tsv');

      logger.success('CSV parsed successfully', LogCategory.DATA, {
        fileName: file.name,
        tableName,
        rows: rowCount,
        columns: headers.length,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return {
        headers,
        rows: [], // No sample needed - query DuckDB table directly
        columns: headers.map((name) => ({ name, values: [] })),
        metadata: {
          delimiter: isTsv ? '\t' : ',',
          linebreak: '\n',
          rowCount,
          columnCount: headers.length,
          fileType: 'csv',
          parsedWithWorker: false,
          duckdbTableName: tableName
        }
      };
    } catch (error) {
      // Cleanup on error
      if (tableName && Duck) {
        try {
          await Duck.query(`DROP TABLE IF EXISTS ${tableName}`);
        } catch (cleanupError) {
          logger.warn('Failed to cleanup table', LogCategory.DATA, {
            tableName,
            error: cleanupError
          });
        }
      }

      if (error instanceof ParserError) {
        throw error;
      }

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
