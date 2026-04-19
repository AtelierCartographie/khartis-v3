import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';

export interface TestDuckDB {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
}

export async function createTestInstance(): Promise<TestDuckDB> {
  const instance = await DuckDBInstance.create(':memory:', {
    threads: '2',
    autoinstall_known_extensions: 'true',
    autoload_known_extensions: 'true'
  });
  const connection = await instance.connect();
  return { instance, connection };
}

export async function destroyTestInstance(db: TestDuckDB): Promise<void> {
  db.connection.closeSync();
  db.instance.closeSync();
}

export async function query(
  db: TestDuckDB,
  sql: string
): Promise<Record<string, unknown>[]> {
  const reader = await db.connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Record<string, unknown>[];
}

export async function run(db: TestDuckDB, sql: string): Promise<void> {
  await db.connection.run(sql);
}

export async function getRowCount(
  db: TestDuckDB,
  tableName: string
): Promise<number> {
  const rows = await query(db, `SELECT COUNT(*) AS cnt FROM "${tableName}"`);
  return Number(rows[0].cnt);
}
