import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';

/**
 * CSV Parser - Parses CSV/TSV files using DuckDB's native read_csv
 *
 * Supports:
 * - CSV (comma-separated)
 * - TSV (tab-separated)
 * - Custom delimiters (auto-detected by DuckDB)
 * - Large files processing efficiently in WASM
 * - Automatic type inference by DuckDB
 * - Direct table creation without intermediate structures
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
    const start = performance.now();
    logger.info('Parsing CSV/TSV file with DuckDB', LogCategory.DATA, {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    let tableName: string | undefined;

    try {
      // Ensure DuckDB is initialized
      await initDuckDB();
      if (!Duck) {
        throw new DuckDBError('DuckDB not initialized');
      }

      // Generate a unique table name for this CSV
      const baseTableName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      tableName = `csv_${baseTableName}_${Date.now()}`;

      // Register the file with DuckDB
      await Duck.register_files([file]);
      const fileWithId = file as any; // File with added id property

      // Determine delimiter for TSV files
      const delimiter = file.name.toLowerCase().endsWith('.tsv')
        ? '\t'
        : undefined;

      // Use DuckDB's read_csv to create a table
      // DuckDB will auto-detect delimiter, headers, and types
      const createTableQuery = delimiter
        ? `CREATE OR REPLACE TABLE ${tableName} AS FROM read_csv('${fileWithId.id}', header=true, delimiter='${delimiter}', normalize_names=true, auto_detect=true)`
        : `CREATE OR REPLACE TABLE ${tableName} AS FROM read_csv('${fileWithId.id}', header=true, normalize_names=true, auto_detect=true)`;

      await Duck.query(createTableQuery);

      // Get table info to build RawDataset structure
      const columnsInfo = (await Duck.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `)) as Array<{ column_name: string; data_type: string }>;

      // Get row count
      const [{ count: rowCount }] = (await Duck.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `)) as Array<{ count: number }>;

      // Extract headers from column info
      const headers = columnsInfo.map((col) => col.column_name);

      // For compatibility with existing pipeline, we need to provide rows and columns
      // But we'll do this efficiently by only fetching a sample for type inference
      const sampleSize = Math.min(1000, Number(rowCount));
      const sampleData = (await Duck.query(`
        SELECT * FROM ${tableName} LIMIT ${sampleSize}
      `)) as Array<Record<string, unknown>>;

      // Convert DuckDB result to rows format expected by RawDataset
      const rows: unknown[][] = sampleData.map((row) =>
        headers.map((header) => row[header] ?? null)
      );

      // Build columns structure for compatibility
      const columns = headers.map((name) => ({
        name,
        values: sampleData.map((row) => row[name] ?? null)
      }));

      // Get delimiter info if possible (DuckDB doesn't expose this directly)
      // We'll default to comma for CSV and tab for TSV
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
      // Clean up table if created
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
