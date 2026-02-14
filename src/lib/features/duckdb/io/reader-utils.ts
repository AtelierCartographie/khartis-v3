import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';

export async function addRowId(
  connection: AsyncDuckDBConnection,
  table: string
): Promise<void> {
  const safeSeqName = table.replace(/[^a-zA-Z0-9_]/g, '_');
  const escapedTable = escapeIdentifier(table);
  await executeQuery(
    connection,
    `CREATE OR REPLACE SEQUENCE "id_${safeSeqName}" START 1;`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
  await executeQuery(
    connection,
    `ALTER TABLE "${escapedTable}" ADD COLUMN IF NOT EXISTS ${INTERNAL_COLUMN.ID} INTEGER DEFAULT nextval('id_${safeSeqName}');`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
}
