import { DuckDBInstance } from '@duckdb/node-api';

// Server test files run in parallel processes. Installing the spatial extension once, before any
// of them starts, keeps them from racing on the first download into the shared extension directory.
export default async function setup(): Promise<void> {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    await connection.run('INSTALL spatial');
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
