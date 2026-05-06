import type { QueryFormat } from '../enums';

export interface QueryOptions {
  format?: QueryFormat;
  useProxy?: boolean;
}

export type DuckDBUnsafeBindings = {
  runQuery(conn: unknown, query: string): Promise<ArrayBuffer | Uint8Array>;
};

export type DuckDBStreamingBindings = DuckDBUnsafeBindings & {
  startPendingQuery(
    conn: unknown,
    query: string,
    allowStreamResult?: boolean
  ): Promise<Uint8Array | null>;
  pollPendingQuery(conn: unknown): Promise<Uint8Array | null>;
  fetchQueryResults(conn: unknown): Promise<Uint8Array | null>;
  cancelPendingQuery(conn: unknown): Promise<boolean>;
  isDetached?(): boolean;
};

export type DescribeResult = {
  name: string[];
  type: string[];
};
