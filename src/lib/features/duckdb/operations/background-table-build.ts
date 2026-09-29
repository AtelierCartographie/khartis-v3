import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { registerTableMutationCallback } from '../cache/cache-manager';
import { waitForQueryIdle } from '../core/query-activity';

// DuckDB WASM runs one query at a time: a batch only starts once the connection
// is idle, so a foreground query waits for one short batch at most.
const BATCH_ROW_COUNT = 1000;
const FOREGROUND_IDLE_MS = 30;

interface DuckDBClientForBackgroundBuild {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  invalidateTableCache?(tableName: string): void;
}

export interface BackgroundTableBuildOptions {
  sourceTable: string;
  targetTable: string;
  projection: string;
}

interface BackgroundTableBuild {
  sourceTable: string;
  stale: boolean;
  pending: boolean;
  settled: Promise<boolean>;
}

const buildsByTarget = new Map<string, BackgroundTableBuild>();
let buildCount = 0;

registerTableMutationCallback((table: string) => {
  for (const build of buildsByTarget.values()) {
    if (build.sourceTable === table) {
      build.stale = true;
    }
  }
});

/**
 * Materializes `SELECT projection FROM sourceTable` into targetTable without
 * holding the DuckDB queue, in source row order. The target only ever holds a
 * complete result: rows are written to a staging table swapped in at the end.
 */
export function buildTableInBackground(
  duck: DuckDBClientForBackgroundBuild,
  options: BackgroundTableBuildOptions
): void {
  buildCount += 1;
  const stagingTable = `${options.targetTable}__building_${buildCount}`;
  const build: BackgroundTableBuild = {
    sourceTable: options.sourceTable,
    stale: false,
    pending: true,
    settled: Promise.resolve(false)
  };
  const isCurrent = () =>
    buildsByTarget.get(options.targetTable) === build && !build.stale;

  buildsByTarget.set(options.targetTable, build);
  build.settled = buildInBatches(duck, options, stagingTable, isCurrent)
    .catch(async (error) => {
      logger.warn(
        `Building ${options.targetTable} in a single pass`,
        LogCategory.DUCKDB,
        error
      );
      await dropTable(duck, stagingTable);
      if (!isCurrent()) return false;
      await duck.query(`
        CREATE OR REPLACE TABLE "${escapeIdentifier(options.targetTable)}" AS
        SELECT ${options.projection} FROM "${escapeIdentifier(options.sourceTable)}"
      `);
      duck.invalidateTableCache?.(options.targetTable);
      return isCurrent();
    })
    .catch((error) => {
      logger.error(
        `Failed to build ${options.targetTable}`,
        LogCategory.DUCKDB,
        error
      );
      return false;
    })
    .finally(() => {
      build.pending = false;
    });
}

async function buildInBatches(
  duck: DuckDBClientForBackgroundBuild,
  { sourceTable, targetTable, projection }: BackgroundTableBuildOptions,
  stagingTable: string,
  isCurrent: () => boolean
): Promise<boolean> {
  const escapedSource = escapeIdentifier(sourceTable);
  const escapedStaging = escapeIdentifier(stagingTable);
  const selectBatch = (start: number) => `
    SELECT ${projection} FROM "${escapedSource}"
    WHERE rowid >= ${start} AND rowid < ${start + BATCH_ROW_COUNT}
  `;

  await waitForQueryIdle(FOREGROUND_IDLE_MS);
  const rows = (await duck.query(
    `SELECT MAX(rowid) AS max_row_id FROM "${escapedSource}"`,
    { format: 'array' }
  )) as Array<{ max_row_id: number | bigint | null }>;
  const maxRowId = Number(rows[0]?.max_row_id ?? -1);

  await duck.query(
    `CREATE OR REPLACE TABLE "${escapedStaging}" AS ${selectBatch(0)}`
  );
  for (
    let start = BATCH_ROW_COUNT;
    start <= maxRowId;
    start += BATCH_ROW_COUNT
  ) {
    await waitForQueryIdle(FOREGROUND_IDLE_MS);
    if (!isCurrent()) {
      await dropTable(duck, stagingTable);
      return false;
    }
    await duck.query(`INSERT INTO "${escapedStaging}" ${selectBatch(start)}`);
  }

  if (!isCurrent()) {
    await dropTable(duck, stagingTable);
    return false;
  }
  await duck.query(`
    DROP TABLE IF EXISTS "${escapeIdentifier(targetTable)}";
    ALTER TABLE "${escapedStaging}" RENAME TO "${escapeIdentifier(targetTable)}";
  `);
  duck.invalidateTableCache?.(targetTable);
  return true;
}

async function dropTable(
  duck: DuckDBClientForBackgroundBuild,
  table: string
): Promise<void> {
  await duck
    .query(`DROP TABLE IF EXISTS "${escapeIdentifier(table)}"`)
    .catch(() => undefined);
}

export function isTableBuildPending(targetTable: string): boolean {
  return buildsByTarget.get(targetTable)?.pending ?? false;
}

export async function waitForTableBuild(targetTable: string): Promise<void> {
  await buildsByTarget.get(targetTable)?.settled;
}

export async function isBuiltTableFresh(targetTable: string): Promise<boolean> {
  const build = buildsByTarget.get(targetTable);
  if (!build) return false;
  const built = await build.settled;
  return built && buildsByTarget.get(targetTable) === build && !build.stale;
}
