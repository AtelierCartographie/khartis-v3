import * as duckdb from '@duckdb/duckdb-wasm';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

async function convertToGeoParquet() {

  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);

  await db.query(`INSTALL spatial; LOAD spatial;`);

  const geojsonPath = join(
    __dirname,
    '../static/basemaps/geometry/world-countries-50m.geojson'
  );

  await db.query(`
    CREATE TABLE world_countries AS
    SELECT * FROM ST_Read('${geojsonPath}')
  `);

  await db.query(`
    COPY (
      SELECT
        COALESCE(ISO_A2, NAME) as id,
        geom
      FROM world_countries
    ) TO 'world-countries-50m.parquet'
    (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
  `);

  await db.terminate();
}

convertToGeoParquet().catch(console.error);
