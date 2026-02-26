import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { analyse } from '$lib/features/duckdb/macros/analyse';

export interface TestDuckDB {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
}

interface GeometryInfo {
  geometryType: string | null;
  xmin: number | null;
  ymin: number | null;
  xmax: number | null;
  ymax: number | null;
}

export async function createTestInstance(): Promise<TestDuckDB> {
  const instance = await DuckDBInstance.create(':memory:', {
    threads: '2'
  });
  const connection = await instance.connect();

  await connection.run('INSTALL spatial; LOAD spatial;');

  const macroStatements = analyse.split(';').filter((s) => s.trim().length > 0);
  for (const statement of macroStatements) {
    await connection.run(`${statement};`);
  }

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

export async function getRowCount(
  db: TestDuckDB,
  tableName: string
): Promise<number> {
  const rows = await query(db, `SELECT COUNT(*) AS cnt FROM "${tableName}"`);
  return Number(rows[0].cnt);
}

export async function getColumns(
  db: TestDuckDB,
  tableName: string
): Promise<ColumnInfo[]> {
  const rows = await query(
    db,
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'`
  );
  return rows as unknown as ColumnInfo[];
}

export async function getGeometryInfo(
  db: TestDuckDB,
  tableName: string,
  geomCol: string = 'geom'
): Promise<GeometryInfo> {
  const typeRows = await query(
    db,
    `SELECT ST_GeometryType("${geomCol}") AS gtype FROM "${tableName}" WHERE "${geomCol}" IS NOT NULL LIMIT 1`
  );

  const boundsRows = await query(
    db,
    `WITH ext AS (SELECT ST_Extent("${geomCol}") AS e FROM "${tableName}")
		 SELECT ST_XMin(e) AS xmin, ST_YMin(e) AS ymin, ST_XMax(e) AS xmax, ST_YMax(e) AS ymax FROM ext`
  );

  return {
    geometryType: (typeRows[0]?.gtype as string) ?? null,
    xmin: boundsRows[0]?.xmin != null ? Number(boundsRows[0].xmin) : null,
    ymin: boundsRows[0]?.ymin != null ? Number(boundsRows[0].ymin) : null,
    xmax: boundsRows[0]?.xmax != null ? Number(boundsRows[0].xmax) : null,
    ymax: boundsRows[0]?.ymax != null ? Number(boundsRows[0].ymax) : null
  };
}

export async function dropTable(
  db: TestDuckDB,
  tableName: string
): Promise<void> {
  await db.connection.run(`DROP TABLE IF EXISTS "${tableName}"`);
}
