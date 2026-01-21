import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';

export async function addRowId(
  connection: AsyncDuckDBConnection,
  table: string
): Promise<void> {
  const safeSeqName = table.replace(/[^a-zA-Z0-9_]/g, '_');
  await executeQuery(
    connection,
    `CREATE OR REPLACE SEQUENCE "id_${safeSeqName}" START 1;`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
  await executeQuery(
    connection,
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS __id INTEGER DEFAULT nextval('id_${safeSeqName}');`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
}
