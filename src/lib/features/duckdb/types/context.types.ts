import type * as duckdb from '@duckdb/duckdb-wasm';
import type { TableMetadata } from './table.types';
import type { DescribeResult } from './query.types';
import type {
  ExtensionsLoaded,
  ExtensionLoadPromises
} from './extension.types';

export interface DuckDBContext {
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
  loaded_files: Map<string, string>;
  registered_files: Set<string>;
  table_metadata: Map<string, TableMetadata>;
  describeCache: Map<string, DescribeResult>;
  rowCountCache: Map<string, number>;
  extensionsLoaded: ExtensionsLoaded;
  extensionLoadPromises: ExtensionLoadPromises;
  localExtensionRepositoryConfigured: boolean;
  threadsSupported: boolean;
  bundleVariant: 'eh' | 'mvp';
}
