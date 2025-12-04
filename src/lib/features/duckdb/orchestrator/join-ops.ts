import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import type {
  BasemapMetadata,
  JoinQuality
} from '$lib/features/map/types/basemap.types';
import { isOSMBasemap } from '$lib/features/map/services/osm-tile.service';
import type { Table } from 'apache-arrow/Arrow';
import { join_macros } from '../macros/join';
import type { DuckDBDataset } from '../types';
import { detectGPSColumns } from './gps-ops';

export interface DuckDBClientForJoin {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  join_by_id(
    tableName: string,
    geoColumn: string,
    options: { basemaps_table: string }
  ): Promise<unknown>;
  apply_join_association(
    tableName: string,
    basemapFile: string
  ): Promise<unknown>;
}

export function getBasemapAttributesId(basemap: BasemapMetadata): string {
  return basemap.file.replace(/\.(parquet|geojson)$/i, '');
}

export async function computeJoinStats(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin
): Promise<JoinQuality> {
  await Duck.query(join_macros);

  const basemapId = getBasemapAttributesId(basemap);

  const tableCheck = (await Duck.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'basemap_attributes'`,
    { format: 'array' }
  )) as Array<{ table_name: string }>;

  if (!tableCheck || tableCheck.length === 0) {
    throw new Error(
      'basemap_attributes table not loaded. Ensure basemapService.loadAttributes() was called.'
    );
  }

  const joinTableView = `basemap_join_${basemapId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const escapedBasemapId = escapeSqlString(basemapId);
  await Duck.query(`
    CREATE OR REPLACE VIEW "${joinTableView}" AS
    SELECT raw, id, variant, normalized, basemap, basemap_count
    FROM basemap_attributes
    WHERE basemap = '${escapedBasemapId}'
  `);

  const attributeCount = (await Duck.query(
    `SELECT COUNT(*) as cnt FROM "${joinTableView}"`,
    { format: 'array' }
  )) as Array<{ cnt: number }>;

  if (!attributeCount?.[0]?.cnt || attributeCount[0].cnt === 0) {
    throw new Error(
      `No attributes found for basemap '${basemapId}'. The basemap may not be properly indexed in basemap_attributes.`
    );
  }

  const escapedTableName = escapeSqlString(dataset.tableName);
  const escapedGeoColumn = escapeSqlString(geoColumn);
  const result = (await Duck.query(
    `SELECT * FROM analyze_join_quality('${escapedTableName}', '${escapedGeoColumn}', '${joinTableView}')`,
    { format: 'array' }
  )) as Array<{
    original_name: string;
    status: 'matched' | 'check' | 'ambiguous' | 'not_found';
    candidates: { id: string; name: string; score: number; type: string }[];
    best_score: number;
  }>;

  const entities = result.map((r) => ({
    dataValue: r.original_name,
    status: (r.status === 'ambiguous'
      ? 'to_verify'
      : r.status === 'check'
        ? 'to_verify'
        : r.status === 'not_found'
          ? 'unrecognized'
          : 'joined') as 'joined' | 'to_verify' | 'duplicate' | 'unrecognized',
    matches: r.candidates?.map((c) => c.name) || [],
    matchCount: r.candidates?.length || 0,
    basemapValue: r.status === 'matched' ? r.candidates[0].name : undefined
  }));

  return {
    joinedCount: entities.filter((e) => e.status === 'joined').length,
    toVerifyCount: entities.filter((e) => e.status === 'to_verify').length,
    duplicateCount: entities.filter((e) => e.status === 'duplicate').length,
    unrecognizedCount: entities.filter((e) => e.status === 'unrecognized')
      .length,
    entities,
    totalEntities: entities.length
  };
}

export async function applyJoinCorrections(
  dataset: DuckDBDataset,
  geoColumn: string,
  corrections: Record<string, string>,
  Duck: DuckDBClientForJoin & { register_files(files: File[]): Promise<void> }
): Promise<void> {
  const correctionsTable = `corrections_${crypto.randomUUID().replace(/-/g, '_')}`;

  const correctionEntries = Object.entries(corrections).map(
    ([original, corrected]) => ({
      original,
      corrected
    })
  );

  if (correctionEntries.length === 0) return;

  const json = JSON.stringify(correctionEntries);
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], 'corrections.json', {
    type: 'application/json'
  });

  await Duck.register_files([file]);
  await Duck.query(
    `CREATE TABLE "${correctionsTable}" AS SELECT * FROM read_json_auto('corrections.json')`
  );

  await Duck.query(`
    UPDATE "${dataset.tableName}"
    SET "${geoColumn}" = c.corrected
    FROM "${correctionsTable}" c
    WHERE "${geoColumn}" = c.original
  `);

  await Duck.query(`DROP TABLE "${correctionsTable}"`);
}

export interface FinalizeJoinResult {
  joinedBasemap: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: { lat: string; lon: string };
}

export async function finalizeJoin(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin
): Promise<FinalizeJoinResult> {
  const start = performance.now();
  logger.info('Finalizing join for dataset', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file,
    geoColumn
  });

  if (isOSMBasemap(basemap)) {
    return finalizeOSMJoin(dataset, basemap);
  }

  if (geoColumn) {
    const columnExists = dataset.columns.some((c) => c.name === geoColumn);
    if (!columnExists) {
      throw new Error(
        `Column '${geoColumn}' not found in dataset. Available columns: ${dataset.columns.map((c) => c.name).join(', ')}`
      );
    }
  }

  await Duck.query(join_macros);

  await Duck.join_by_id(dataset.tableName, geoColumn, {
    basemaps_table: 'basemap_attributes'
  });

  await Duck.apply_join_association(dataset.tableName, basemap.file);

  const joinedCountResult = (await Duck.query(
    `SELECT COUNT(*) as cnt FROM "${dataset.tableName}" WHERE basemap_id IS NOT NULL`,
    { format: 'array' }
  )) as Array<{ cnt: number }>;

  const joinedCount = joinedCountResult?.[0]?.cnt ?? 0;
  if (joinedCount === 0) {
    logger.warn('Join produced 0 matches', LogCategory.DATA, {
      datasetId: dataset.id,
      basemap: basemap.file,
      geoColumn
    });
  } else {
    logger.info('Join validation passed', LogCategory.DATA, {
      joinedCount,
      totalRows: dataset.rowCount,
      matchPercentage: ((joinedCount / dataset.rowCount) * 100).toFixed(1)
    });
  }

  logger.success('Join finalized successfully', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file,
    joinedCount,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return {
    joinedBasemap: basemap.file,
    geoColumn
  };
}

function finalizeOSMJoin(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata
): FinalizeJoinResult {
  const start = performance.now();
  logger.info('Finalizing OSM join (GPS mode)', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file
  });

  const gpsColumns = detectGPSColumns(dataset.columns);
  if (!gpsColumns) {
    throw new Error(
      'GPS columns (latitude/longitude) not found in dataset for OSM basemap'
    );
  }

  logger.success('OSM join finalized (GPS mode)', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file,
    gpsColumns,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return {
    joinedBasemap: basemap.file,
    gpsMode: true,
    gpsColumns
  };
}

export async function getJoinedArrowTable(
  datasetTableName: string,
  basemapId: string,
  Duck: DuckDBClientForJoin,
  loadGeometryIntoDuckDB: (basemapId: string) => Promise<string>,
  getArrowTableDirect: (tableName: string) => Promise<Table>
): Promise<Table> {
  const start = performance.now();
  logger.info('Creating joined Arrow table for rendering', LogCategory.MAP, {
    datasetTableName,
    basemapId
  });

  const geometryTable = await loadGeometryIntoDuckDB(basemapId);

  const joinedView = `joined_${datasetTableName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const escapedDataset = escapeSqlString(datasetTableName);
  const escapedGeometry = escapeSqlString(geometryTable);

  await Duck.query(`
    CREATE OR REPLACE VIEW "${joinedView}" AS
    SELECT d.*, g.geom
    FROM "${escapedDataset}" d
    LEFT JOIN "${escapedGeometry}" g
    ON d.basemap_id = g.id
    WHERE g.geom IS NOT NULL
  `);

  const arrowTable = await getArrowTableDirect(joinedView);

  logger.success('Joined Arrow table created', LogCategory.MAP, {
    joinedView,
    rows: arrowTable.numRows,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return arrowTable;
}
