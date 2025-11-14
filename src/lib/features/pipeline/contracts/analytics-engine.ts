import type { RawDataset } from '../models/raw-dataset';
import type { ColumnStats } from '../models/column-stats';

/**
 * Analytics engine interface - Adapter pattern
 *
 * Responsibility: Compute statistics and manage analytical tables
 *
 * This interface abstracts away the analytics backend (DuckDB, SQLite, in-memory, etc.)
 * allowing implementations to be swapped without affecting business logic.
 *
 * @example
 * ```typescript
 * class DuckDBAnalyticsEngine implements IAnalyticsEngine {
 *   async initialize(): Promise<void> {
 *     await duckdb.init();
 *   }
 *
 *   async createTable(name: string, data: RawDataset): Promise<string> {
 *     const tableName = generateUniqueName(name);
 *     await duckdb.loadData(tableName, data);
 *     return tableName;
 *   }
 *
 *   async analyze(tableName: string): Promise<ColumnStats[]> {
 *     return await duckdb.query(`FROM describe_full('${tableName}')`);
 *   }
 * }
 * ```
 */
export interface IAnalyticsEngine {
  /**
   * Initialize analytics engine
   *
   * @throws AnalyticsEngineError if initialization fails
   */
  initialize(): Promise<void>;

  /**
   * Create analytical table from RawDataset
   *
   * @param name - Suggested table name
   * @param data - RawDataset to load
   * @returns Actual table name created (may be different from suggested)
   * @throws AnalyticsEngineError if table creation fails
   */
  createTable(name: string, data: RawDataset): Promise<string>;

  /**
   * Analyze table and compute statistics for all columns
   *
   * @param tableName - Name of table to analyze
   * @returns Array of ColumnStats (one per column)
   * @throws AnalyticsEngineError if analysis fails
   */
  analyze(tableName: string): Promise<ColumnStats[]>;

  /**
   * Compute classification breaks for a numeric column
   *
   * @param tableName - Name of table
   * @param columnName - Name of column
   * @param method - Classification method (quantile, equal, jenks, etc.)
   * @param k - Number of classes
   * @returns Array of break values
   * @throws AnalyticsEngineError if computation fails
   */
  computeBreaks(
    tableName: string,
    columnName: string,
    method: string,
    k: number
  ): Promise<number[]>;

  /**
   * Get row count for table
   *
   * @param tableName - Name of table
   * @returns Number of rows
   * @throws AnalyticsEngineError if query fails
   */
  getRowCount(tableName: string): Promise<number>;

  /**
   * Drop table from analytics engine
   *
   * @param tableName - Name of table to drop
   * @throws AnalyticsEngineError if drop fails
   */
  dropTable(tableName: string): Promise<void>;

  /**
   * Cleanup and close analytics engine
   */
  destroy(): Promise<void>;
}

/**
 * Analytics engine error - thrown when analytics operations fail
 */
export class AnalyticsEngineError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly tableName?: string
  ) {
    super(message);
    this.name = 'AnalyticsEngineError';
  }
}
