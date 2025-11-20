import type { RawDataset } from '../models/raw-dataset';
import type { ColumnStats } from '../models/column-stats';

/**
 * Abstraction over the analytics backend (DuckDB or alternatives).
 */
export interface IAnalyticsEngine {
  initialize(): Promise<void>;
  createTable(name: string, data: RawDataset): Promise<string>;
  analyze(tableName: string): Promise<ColumnStats[]>;
  computeBreaks(
    tableName: string,
    columnName: string,
    method: string,
    k: number
  ): Promise<number[]>;
  getRowCount(tableName: string): Promise<number>;
  dropTable(tableName: string): Promise<void>;
  destroy(): Promise<void>;
}

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
