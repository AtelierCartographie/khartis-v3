import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';

/**
 * Parses CSV/TSV files with DuckDB's native CSV reader for fast WASM ingestion.
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
    logger.info('Parsing CSV/TSV file with DuckDB', LogCategory.DATA, {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    let tableName: string | undefined;

    try {
      await initDuckDB();
      if (!Duck) {
        throw new DuckDBError('DuckDB not initialized');
      }

      const baseTableName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      tableName = `csv_${baseTableName}_${Date.now()}`;

      await Duck.register_files([file]);
      const fileWithId = file as any; // DuckDB adds an id property.

      const delimiter = file.name.toLowerCase().endsWith('.tsv')
        ? '\t'
        : undefined;

      const createTableQuery = delimiter
        ? `CREATE OR REPLACE TABLE ${tableName} AS FROM read_csv('${fileWithId.id}', header=true, delimiter='${delimiter}', normalize_names=true, auto_detect=true)`
        : `CREATE OR REPLACE TABLE ${tableName} AS FROM read_csv('${fileWithId.id}', header=true, normalize_names=true, auto_detect=true)`;

      await Duck.query(createTableQuery);

      const columnsInfo = (await Duck.query(
        `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `,
        { format: 'array' }
      )) as Array<{ column_name: string; data_type: string }>;

      const [{ count: rowCount }] = (await Duck.query(
        `
        SELECT COUNT(*) as count FROM ${tableName}
      `,
        { format: 'array' }
      )) as Array<{ count: number }>;

      const headers = columnsInfo.map((col) => col.column_name);

      // Provide rows/columns for downstream consumers without loading everything.
      const sampleSize = Math.min(1000, Number(rowCount));
      const sampleData = (await Duck.query(
        `
        SELECT * FROM ${tableName} LIMIT ${sampleSize}
      `,
        { format: 'array' }
      )) as Array<Record<string, unknown>>;

      const rows: unknown[][] = sampleData.map((row) =>
        headers.map((header) => row[header] ?? null)
      );

      const columns = headers.map((name) => ({
        name,
        values: sampleData.map((row) => row[name] ?? null)
      }));

      const detectedDelimiter = file.name.toLowerCase().endsWith('.tsv')
        ? '\t'
        : ',';

      logger.success('CSV parsed successfully with DuckDB', LogCategory.DATA, {
        fileName: file.name,
        rows: rowCount,
        columns: headers.length,
        tableName,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return {
        headers,
        rows,
        columns,
        metadata: {
          delimiter: detectedDelimiter,
          linebreak: '\n', // Default, DuckDB doesn't expose this
          rowCount: Number(rowCount),
          columnCount: headers.length,
          fileType: 'csv',
          parsedWithWorker: false,
          duckdbTableName: tableName // Store table name for later use
        }
      };
    } catch (error) {
      if (tableName && Duck) {
        try {
          await Duck.query(`DROP TABLE IF EXISTS ${tableName}`);
        } catch (cleanupError) {
          logger.warn(
            'Failed to clean up table after error',
            LogCategory.DATA,
            {
              tableName,
              error: cleanupError
            }
          );
        }
      }

      if (error instanceof ParserError) {
        throw error;
      } else {
        logger.error('CSV parsing failed with DuckDB', LogCategory.DATA, {
          fileName: file.name,
          error
        });
        throw new ParserError(
          `Failed to parse CSV with DuckDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error,
          'csv'
        );
      }
    }
  }
}
