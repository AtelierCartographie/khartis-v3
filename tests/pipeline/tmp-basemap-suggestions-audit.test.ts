import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs';
import { basename, dirname, extname, join, relative } from 'path';
import { tmpdir } from 'os';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/map/services/basemap.service.svelte', async () => {
  return {
    getBasemapVariantFamily: (file: string) =>
      file.replace(/-(low|medium|high)$/, ''),
    getPreferredCatalogBasemapLevel: (
      basemaps: Array<{ file: string; simplification_level?: string }>,
      basemapFile: string
    ) => {
      const family = basemapFile.replace(/-(low|medium|high)$/, '');
      const familyBasemaps = basemaps.filter(
        (basemap) => basemap.file.replace(/-(low|medium|high)$/, '') === family
      );
      const isFranceAdministrativeFamily = [
        'france-canton-',
        'france-commune-',
        'france-departement-',
        'france-region-'
      ].some((prefix) => family.startsWith(prefix));
      const priority = isFranceAdministrativeFamily
        ? ['high', 'low']
        : ['medium', 'high', 'low'];

      for (const level of priority) {
        if (
          familyBasemaps.some(
            (basemap) => basemap.simplification_level === level
          )
        ) {
          return level;
        }
      }

      return null;
    },
    basemapService: {
      ensureAttributesLoaded: vi.fn(),
      loadGeometryIntoDuckDB: vi.fn()
    }
  };
});

vi.mock('$lib/features/map/utils/read-geojson-arrow', () => ({
  addGeoArrowMetadata: <T>(table: T) => table
}));

import {
  GeoColumnDetector,
  type GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { detectCsvHeader } from '$lib/features/data-pipeline/utils/csv-header-detector';
import {
  detectDecimalSeparator,
  readFileHead
} from '$lib/features/data-pipeline/utils/decimal-detector';
import {
  getGPSBounds,
  validateGPSColumns
} from '$lib/features/duckdb/orchestrator/gps-ops';
import { join_macros } from '$lib/features/duckdb/macros/join';
import {
  computeJoinSynthesis,
  type DuckDBClientForJoin
} from '$lib/features/duckdb/orchestrator/join-ops';
import { FileType, type DuckDBDataset } from '$lib/features/duckdb/types';
import {
  getCatalogBasemapsForDisplay,
  rankBasemapsByGPSBbox,
  rankBasemapsByGeoColumn,
  rankBasemapsByJoinSynthesis,
  shouldPreferTextBasemapRefinementForGPS
} from '$lib/features/map/services/basemap-catalog.service.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import {
  createTestInstance,
  destroyTestInstance,
  getColumns,
  getGeometryInfo,
  getRowCount,
  query,
  type TestDuckDB
} from './duckdb-node-helper';

const ROOT = join(process.cwd(), 'static/tests-datasets');
const BASEMAP_ATTRIBUTES_PATH = join(
  process.cwd(),
  'static/basemaps/all-basemaps-attributes.parquet'
);
const BASEMAP_METADATA_PATH = join(
  process.cwd(),
  'static/basemaps/all-basemaps-metadata.json'
);
const REPORT_DIR = join(process.cwd(), 'tmp');
const REPORT_JSON_PATH = join(
  REPORT_DIR,
  'basemap-suggestions-audit-report.json'
);
const REPORT_MD_PATH = join(REPORT_DIR, 'basemap-suggestions-audit-report.md');
const NULL_VALUES = `['', ':', '-', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'nil', 'NIL', 'none', 'NONE', 'None']`;

type AuditMode =
  | 'catalog-gps'
  | 'catalog-text'
  | 'catalog-text-fallback'
  | 'no-geo-suggestion'
  | 'custom-geometry';

interface OracleSynthesisRow {
  basemap: string;
  shareBasemap: number;
  shareCandidate: number;
  method: 'exact' | 'fuzzy';
}

interface GeoColumnAudit {
  columnName: string;
  type: string;
  heuristicSuggestions: string[];
  oracleSuggestions: string[];
  heuristicSuggestionDetails: Array<{
    file: string;
    matchScore: number;
  }>;
  oracleSuggestionDetails: Array<{
    file: string;
    matchScore: number;
  }>;
  oracleBestShareCandidate: number;
  oracleMethod: 'exact' | 'fuzzy' | 'none';
}

interface DatasetAuditEntry {
  fixture: string;
  mode: AuditMode;
  importKind: 'csv' | 'geo' | 'zip-csv' | 'zip-geo';
  rowCount?: number;
  geometryType?: string | null;
  detectedGeoColumns: Array<{
    columnName: string;
    type: string;
    confidence: number;
  }>;
  selectedGeoColumn?: string;
  bestGeoColumn?: string;
  currentSuggestions: string[];
  oracleSuggestions: string[];
  currentSuggestionDetails?: Array<{
    file: string;
    matchScore: number;
  }>;
  oracleSuggestionDetails?: Array<{
    file: string;
    matchScore: number;
  }>;
  notes: string[];
  issues: string[];
  gpsValidation?: {
    isValid: boolean;
    possibleInversion: boolean;
    latColumn: string;
    lonColumn: string;
    warning?: string;
  };
  candidateColumns?: GeoColumnAudit[];
}

interface FileEntry {
  path: string;
  category: 'primary' | 'companion' | 'hidden-artifact' | 'unsupported';
}

interface AuditReport {
  generatedAt: string;
  allFiles: FileEntry[];
  primaryDatasets: DatasetAuditEntry[];
  issueCount: number;
}

const PRIMARY_RULES = [
  { prefix: 'csv/', extension: '.csv', kind: 'csv' as const },
  { prefix: 'geojson/', extension: '.geojson', kind: 'geo' as const },
  { prefix: 'gpkg/', extension: '.gpkg', kind: 'geo' as const },
  { prefix: 'gpx/', extension: '.gpx', kind: 'geo' as const },
  { prefix: 'kml-kmz/', extension: '.kml', kind: 'geo' as const },
  { prefix: 'shp/', extension: '.shp', kind: 'geo' as const },
  { prefix: 'zip/', extension: '.zip', kind: 'zip' as const }
] as const;

const SUPPORT_EXTENSIONS = new Set([
  '.cpg',
  '.cst',
  '.dbf',
  '.log',
  '.png',
  '.prj',
  '.qpj',
  '.shx',
  '.webloc',
  '.xml',
  '.yml'
]);

let db: TestDuckDB;
let catalogBasemaps: BasemapMetadata[];
let report: AuditReport;
let tableCounter = 0;

function sqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function uniqueTableName(prefix: string): string {
  tableCounter += 1;
  return `audit_${prefix}_${tableCounter}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function listFiles(dir: string, rootDir: string = dir): string[] {
  return readDirRecursive(dir)
    .map((absolutePath) =>
      relative(rootDir, absolutePath).split('\\').join('/')
    )
    .sort();
}

function readDirRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readDirRecursive(absolutePath));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

function classifyFile(relativePath: string): FileEntry {
  const base = basename(relativePath);
  if (base.startsWith('.') || relativePath.includes('/.')) {
    return { path: relativePath, category: 'hidden-artifact' };
  }

  const primaryRule = PRIMARY_RULES.find(
    (rule) =>
      relativePath.startsWith(rule.prefix) &&
      relativePath.endsWith(rule.extension)
  );
  if (primaryRule) {
    return { path: relativePath, category: 'primary' };
  }

  if (SUPPORT_EXTENSIONS.has(extname(relativePath).toLowerCase())) {
    return { path: relativePath, category: 'companion' };
  }

  return { path: relativePath, category: 'unsupported' };
}

async function loadJoinMacros(db: TestDuckDB): Promise<void> {
  const macroStatements = join_macros
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of macroStatements) {
    await db.connection.run(`${statement};`);
  }
}

async function loadBasemapAttributes(db: TestDuckDB): Promise<void> {
  await db.connection.run(`
    CREATE OR REPLACE TABLE basemap_attributes AS
    SELECT * FROM read_parquet('${sqlQuote(BASEMAP_ATTRIBUTES_PATH)}')
  `);
  await db.connection.run(
    `UPDATE basemap_attributes SET id = raw WHERE variant = id`
  );
}

function createDuckJoinClient(db: TestDuckDB): DuckDBClientForJoin {
  return {
    async query(sql: string): Promise<unknown> {
      return query(db, sql);
    },
    async join_by_id(): Promise<unknown> {
      throw new Error('join_by_id is not used in the audit');
    },
    async apply_join_association(): Promise<unknown> {
      throw new Error('apply_join_association is not used in the audit');
    }
  };
}

async function importCsvLike(
  db: TestDuckDB,
  absolutePath: string
): Promise<string> {
  const file = new File([readFileSync(absolutePath)], basename(absolutePath), {
    type: 'text/csv'
  });
  const cachedHead = await readFileHead(file, 20);
  const detection = await detectDecimalSeparator(file, { cachedHead });
  const headerDetection = await detectCsvHeader(file, detection.delimiter, {
    cachedHead
  });
  const tableName = uniqueTableName(basename(absolutePath));
  const options = [
    `header=${headerDetection.hasHeader}`,
    `decimal_separator="${detection.separator}"`,
    'normalize_names=true',
    `nullstr=${NULL_VALUES}`
  ];

  if (detection.thousandsSeparator) {
    options.push(`thousands="${detection.thousandsSeparator}"`);
  }

  if (detection.delimiter) {
    options.push(`delim='${detection.delimiter}'`);
  }

  const baseImportSql = `
    CREATE OR REPLACE TABLE "${tableName}" AS
    FROM read_csv('${sqlQuote(absolutePath)}', ${options.join(', ')})
  `;

  try {
    await db.connection.run(baseImportSql);
  } catch {
    await db.connection.run(`
      CREATE OR REPLACE TABLE "${tableName}" AS
      FROM read_csv(
        '${sqlQuote(absolutePath)}',
        ${options.join(', ')},
        ignore_errors=true,
        all_varchar=true,
        strict_mode=false,
        null_padding=true
      )
    `);
  }

  const rowCountRows = await query(
    db,
    `SELECT COUNT(*) AS cnt FROM "${tableName}"`
  );
  const rowCount = Number(rowCountRows[0]?.cnt ?? 0);

  if (rowCount === 0) {
    await db.connection.run(`
      CREATE OR REPLACE TABLE "${tableName}" AS
      FROM read_csv(
        '${sqlQuote(absolutePath)}',
        ${options.join(', ')},
        ignore_errors=true,
        all_varchar=true,
        strict_mode=false,
        null_padding=true
      )
    `);
  }

  return tableName;
}

async function importGeoFile(
  db: TestDuckDB,
  absolutePath: string
): Promise<string> {
  const tableName = uniqueTableName(basename(absolutePath));
  await db.connection.run(`
    CREATE OR REPLACE TABLE "${tableName}" AS
    FROM ST_Read('${sqlQuote(absolutePath)}')
  `);
  return tableName;
}

async function getSampleMatrix(
  db: TestDuckDB,
  tableName: string,
  columns: string[],
  limit: number = 200
): Promise<unknown[][]> {
  if (columns.length === 0) {
    return [];
  }

  const escapedColumns = columns.map((column) => `"${column}"`).join(', ');
  const rows = await query(
    db,
    `SELECT ${escapedColumns} FROM "${tableName}" LIMIT ${limit}`
  );

  return rows.map((row) => columns.map((column) => row[column]));
}

function createMinimalProcessedDataset(
  columns: string[],
  geoDetection: GeoDetectionResult
): ProcessedDataset {
  return {
    id: 'audit',
    name: 'audit',
    sourceFileId: 'audit',
    format: 'csv',
    data: [],
    rowCount: 0,
    columns: columns.map((name) => ({
      name,
      type: 'string',
      nullable: true,
      unique: false
    })),
    metadata: {
      processedAt: new Date(),
      transformations: []
    },
    analysis: {
      columns: [],
      geoColumns: geoDetection.geoColumns,
      hasGeoData: geoDetection.hasGeoColumns,
      rowCount: 0,
      warnings: [],
      suggestedGeoColumn: geoDetection.suggestedPrimaryGeoColumn?.columnName
    },
    createdAt: new Date(),
    fileSize: 0,
    geoDetection
  };
}

function createDuckDataset(
  tableName: string,
  columns: string[],
  rowCount: number,
  geoDetection: GeoDetectionResult
): DuckDBDataset {
  return {
    id: tableName,
    tableName,
    sourceFileId: tableName,
    name: tableName,
    columns: columns.map((name) => ({ name })) as DuckDBDataset['columns'],
    rowCount,
    metadata: {
      processedAt: new Date(),
      fileType: FileType.CSV
    },
    geoDetection
  };
}

async function computeExactJoinSynthesis(
  db: TestDuckDB,
  tableName: string,
  geoColumn: string
): Promise<OracleSynthesisRow[]> {
  const escapedGeoColumn = geoColumn.replace(/"/g, '""');
  const rows = (await query(
    db,
    `WITH candidates AS (
       SELECT DISTINCT normalize_text_join(CAST("${escapedGeoColumn}" AS VARCHAR)) AS normalized
       FROM "${tableName}"
       WHERE "${escapedGeoColumn}" IS NOT NULL
         AND trim(CAST("${escapedGeoColumn}" AS VARCHAR)) != ''
     ),
     matched AS (
       SELECT
         c.normalized,
         ba.basemap,
         MAX(ba.basemap_count) AS basemap_count
       FROM candidates c
       JOIN basemap_attributes ba
         ON c.normalized = ba.normalized
       GROUP BY c.normalized, ba.basemap
     ),
     total_candidates AS (
       SELECT COUNT(*) AS cnt FROM candidates
     )
     SELECT
       basemap,
       COUNT(DISTINCT normalized)::DOUBLE / MAX(basemap_count) AS share_basemap,
       COUNT(DISTINCT normalized)::DOUBLE / NULLIF((SELECT cnt FROM total_candidates), 0) AS share_candidate
     FROM matched
     GROUP BY basemap
     ORDER BY share_candidate DESC, share_basemap DESC, basemap ASC`
  )) as Array<{
    basemap: string;
    share_basemap: number;
    share_candidate: number;
  }>;

  return rows.map((row) => ({
    basemap: row.basemap,
    shareBasemap: Number(row.share_basemap),
    shareCandidate: Number(row.share_candidate) * 100,
    method: 'exact'
  }));
}

async function computeOracleSynthesis(
  db: TestDuckDB,
  duckClient: DuckDBClientForJoin,
  dataset: DuckDBDataset,
  geoColumn: string
): Promise<OracleSynthesisRow[]> {
  const exactRows = await computeExactJoinSynthesis(
    db,
    dataset.tableName,
    geoColumn
  );
  const synthesizedRows = await computeJoinSynthesis(
    dataset,
    geoColumn,
    duckClient
  );
  if (synthesizedRows.length === 0) {
    return exactRows;
  }

  const topExact = exactRows[0];
  const topSynthesized = synthesizedRows[0];
  const method: OracleSynthesisRow['method'] =
    topExact &&
    topSynthesized &&
    topExact.basemap === topSynthesized.basemap &&
    Math.abs(topExact.shareCandidate - topSynthesized.shareCandidate) < 1e-6
      ? 'exact'
      : 'fuzzy';

  return synthesizedRows.map((row) => ({
    basemap: row.basemap,
    shareBasemap: row.shareBasemap,
    shareCandidate: row.shareCandidate,
    method
  }));
}

function topBasemapIds(
  rows: OracleSynthesisRow[],
  limit: number = 3
): string[] {
  return rows.slice(0, limit).map((row) => row.basemap);
}

async function auditTabularFixture(
  db: TestDuckDB,
  duckClient: DuckDBClientForJoin,
  fixtureLabel: string,
  absolutePath: string,
  importKind: 'csv' | 'zip-csv'
): Promise<DatasetAuditEntry> {
  const tableName = await importCsvLike(db, absolutePath);
  const rowCount = await getRowCount(db, tableName);
  const columns = (await getColumns(db, tableName)).map(
    (column) => column.column_name
  );
  const matrix = await getSampleMatrix(db, tableName, columns);
  const geoDetection = await GeoColumnDetector.detectGeoColumns(
    columns,
    matrix
  );
  const notes: string[] = [];
  const issues: string[] = [];
  const currentSuggestions: string[] = [];
  const oracleSuggestions: string[] = [];
  const detectedGeoColumns = geoDetection.geoColumns.map((column) => ({
    columnName: column.columnName,
    type: column.type,
    confidence: Number(column.confidence.toFixed(3))
  }));

  const duckDataset = createDuckDataset(
    tableName,
    columns,
    rowCount,
    geoDetection
  );
  const processedDataset = createMinimalProcessedDataset(columns, geoDetection);
  const selectedGeoColumn = geoDetection.suggestedPrimaryGeoColumn?.columnName;

  const gpsColumns =
    geoDetection.geoColumns.some((column) => column.type === 'latitude') &&
    geoDetection.geoColumns.some((column) => column.type === 'longitude')
      ? geoDetection
      : null;

  if (gpsColumns) {
    const resolvedLat =
      geoDetection.geoColumns.find((column) => column.type === 'latitude')
        ?.columnName ?? '';
    const resolvedLon =
      geoDetection.geoColumns.find((column) => column.type === 'longitude')
        ?.columnName ?? '';

    const gpsValidation = await validateGPSColumns(
      tableName,
      resolvedLat,
      resolvedLon,
      {
        query: async (sql: string, _options?: { format?: string }) =>
          query(db, sql)
      }
    );
    const gpsBounds = await getGPSBounds(duckDataset, {
      query: async (sql: string, _options?: { format?: string }) =>
        query(db, sql)
    });

    if (gpsBounds) {
      const suggestions = rankBasemapsByGPSBbox(catalogBasemaps, gpsBounds, 3);
      let currentSuggestionDetails = suggestions.map((suggestion) => ({
        file: suggestion.file,
        matchScore: Number(suggestion.matchScore.toFixed(2))
      }));
      let oracleSuggestionDetails = [...currentSuggestionDetails];
      currentSuggestions.push(
        ...suggestions.map((suggestion) => suggestion.file)
      );
      oracleSuggestions.push(
        ...suggestions.map((suggestion) => suggestion.file)
      );

      const textColumns = geoDetection.geoColumns.filter(
        (column) => !['latitude', 'longitude'].includes(column.type)
      );

      let bestTextColumn: GeoColumnAudit | null = null;
      const candidateColumns: GeoColumnAudit[] = [];

      for (const column of textColumns) {
        const heuristic = rankBasemapsByGeoColumn(
          catalogBasemaps,
          processedDataset,
          column.columnName,
          3
        );
        const oracle = await computeOracleSynthesis(
          db,
          duckClient,
          duckDataset,
          column.columnName
        );
        const synthesisRanked = rankBasemapsByJoinSynthesis(
          catalogBasemaps,
          oracle,
          3
        );
        const current =
          synthesisRanked.length > 0 ? synthesisRanked : heuristic;
        const oracleRankedIds =
          synthesisRanked.length > 0
            ? synthesisRanked.map((item) => item.file)
            : topBasemapIds(oracle);
        const oracleRankedDetails =
          synthesisRanked.length > 0
            ? synthesisRanked.map((item) => ({
                file: item.file,
                matchScore: Number(item.matchScore.toFixed(2))
              }))
            : [];

        const columnAudit: GeoColumnAudit = {
          columnName: column.columnName,
          type: column.type,
          heuristicSuggestions: current.map((item) => item.file),
          oracleSuggestions: oracleRankedIds,
          heuristicSuggestionDetails: current.map((item) => ({
            file: item.file,
            matchScore: Number(item.matchScore.toFixed(2))
          })),
          oracleSuggestionDetails: oracleRankedDetails,
          oracleBestShareCandidate: Number(
            (oracle[0]?.shareCandidate ?? 0).toFixed(2)
          ),
          oracleMethod: oracle[0]?.method ?? 'none'
        };
        candidateColumns.push(columnAudit);

        if (
          !bestTextColumn ||
          columnAudit.oracleBestShareCandidate >
            bestTextColumn.oracleBestShareCandidate
        ) {
          bestTextColumn = columnAudit;
        }
      }

      if (
        bestTextColumn &&
        shouldPreferTextBasemapRefinementForGPS(
          suggestions,
          bestTextColumn.oracleBestShareCandidate
        ) &&
        bestTextColumn.oracleSuggestions.length > 0
      ) {
        currentSuggestions.splice(
          0,
          currentSuggestions.length,
          ...bestTextColumn.oracleSuggestions
        );
        currentSuggestionDetails = [...bestTextColumn.oracleSuggestionDetails];
        oracleSuggestions.splice(
          0,
          oracleSuggestions.length,
          ...bestTextColumn.oracleSuggestions
        );
        oracleSuggestionDetails = [...bestTextColumn.oracleSuggestionDetails];
      }

      if (gpsValidation.warning) {
        notes.push(gpsValidation.warning);
      }

      return {
        fixture: fixtureLabel,
        mode: 'catalog-gps',
        importKind,
        rowCount,
        detectedGeoColumns,
        selectedGeoColumn,
        currentSuggestions,
        oracleSuggestions,
        currentSuggestionDetails,
        oracleSuggestionDetails,
        notes,
        issues,
        gpsValidation: {
          isValid: gpsValidation.isValid,
          possibleInversion: gpsValidation.possibleInversion,
          latColumn: gpsValidation.latColumn,
          lonColumn: gpsValidation.lonColumn,
          warning: gpsValidation.warning
        },
        candidateColumns
      };
    }

    notes.push('GPS columns detected but no valid GPS bounds were produced.');

    return {
      fixture: fixtureLabel,
      mode: 'no-geo-suggestion',
      importKind,
      rowCount,
      detectedGeoColumns,
      selectedGeoColumn,
      currentSuggestions,
      oracleSuggestions,
      currentSuggestionDetails: [],
      oracleSuggestionDetails: [],
      notes,
      issues,
      gpsValidation: {
        isValid: gpsValidation.isValid,
        possibleInversion: gpsValidation.possibleInversion,
        latColumn: gpsValidation.latColumn,
        lonColumn: gpsValidation.lonColumn,
        warning: gpsValidation.warning
      }
    };
  }

  const candidateGeoColumns = geoDetection.geoColumns.filter(
    (column) => !['latitude', 'longitude'].includes(column.type)
  );

  if (candidateGeoColumns.length === 0) {
    return {
      fixture: fixtureLabel,
      mode: 'no-geo-suggestion',
      importKind,
      rowCount,
      detectedGeoColumns,
      selectedGeoColumn,
      currentSuggestions,
      oracleSuggestions,
      notes,
      issues
    };
  }

  const candidateColumns: GeoColumnAudit[] = [];
  let bestColumn: GeoColumnAudit | null = null;

  for (const column of candidateGeoColumns) {
    const heuristic = rankBasemapsByGeoColumn(
      catalogBasemaps,
      processedDataset,
      column.columnName,
      3
    );
    const oracle = await computeOracleSynthesis(
      db,
      duckClient,
      duckDataset,
      column.columnName
    );
    const synthesisRanked = rankBasemapsByJoinSynthesis(
      catalogBasemaps,
      oracle,
      3
    );
    const current = synthesisRanked.length > 0 ? synthesisRanked : heuristic;
    const oracleRankedIds =
      synthesisRanked.length > 0
        ? synthesisRanked.map((item) => item.file)
        : topBasemapIds(oracle);
    const oracleRankedDetails =
      synthesisRanked.length > 0
        ? synthesisRanked.map((item) => ({
            file: item.file,
            matchScore: Number(item.matchScore.toFixed(2))
          }))
        : [];

    const columnAudit: GeoColumnAudit = {
      columnName: column.columnName,
      type: column.type,
      heuristicSuggestions: current.map((item) => item.file),
      oracleSuggestions: oracleRankedIds,
      heuristicSuggestionDetails: current.map((item) => ({
        file: item.file,
        matchScore: Number(item.matchScore.toFixed(2))
      })),
      oracleSuggestionDetails: oracleRankedDetails,
      oracleBestShareCandidate: Number(
        (oracle[0]?.shareCandidate ?? 0).toFixed(2)
      ),
      oracleMethod: oracle[0]?.method ?? 'none'
    };

    candidateColumns.push(columnAudit);

    if (
      !bestColumn ||
      columnAudit.oracleBestShareCandidate > bestColumn.oracleBestShareCandidate
    ) {
      bestColumn = columnAudit;
    }
  }

  const selectedColumnAudit =
    candidateColumns.find(
      (column) => column.columnName === selectedGeoColumn
    ) ?? bestColumn;

  if (!selectedColumnAudit) {
    return {
      fixture: fixtureLabel,
      mode: 'no-geo-suggestion',
      importKind,
      rowCount,
      detectedGeoColumns,
      selectedGeoColumn,
      currentSuggestions,
      oracleSuggestions,
      currentSuggestionDetails: [],
      oracleSuggestionDetails: [],
      notes,
      issues,
      candidateColumns
    };
  }

  currentSuggestions.push(...selectedColumnAudit.heuristicSuggestions);
  oracleSuggestions.push(...selectedColumnAudit.oracleSuggestions);

  if (
    bestColumn &&
    selectedGeoColumn &&
    bestColumn.columnName !== selectedGeoColumn &&
    bestColumn.oracleBestShareCandidate >
      selectedColumnAudit.oracleBestShareCandidate + 5
  ) {
    issues.push(
      `Selected geo column ${selectedGeoColumn} is weaker than ${bestColumn.columnName} (${selectedColumnAudit.oracleBestShareCandidate}% vs ${bestColumn.oracleBestShareCandidate}%).`
    );
  }

  if (selectedColumnAudit.oracleSuggestions.length > 0) {
    const oracleTop = selectedColumnAudit.oracleSuggestions[0];
    if (currentSuggestions.length === 0) {
      issues.push(
        `No suggestion for ${selectedColumnAudit.columnName} although oracle top is ${oracleTop}.`
      );
    } else if (currentSuggestions[0] !== oracleTop) {
      issues.push(
        `Top suggestion mismatch on ${selectedColumnAudit.columnName}: current=${currentSuggestions[0]} oracle=${oracleTop}.`
      );
    }
  } else if (currentSuggestions.length > 0) {
    issues.push(
      `Suggestions were produced for ${selectedColumnAudit.columnName} but oracle found no basemap match.`
    );
  }

  return {
    fixture: fixtureLabel,
    mode:
      selectedColumnAudit.oracleMethod === 'fuzzy'
        ? 'catalog-text-fallback'
        : 'catalog-text',
    importKind,
    rowCount,
    detectedGeoColumns,
    selectedGeoColumn,
    bestGeoColumn: bestColumn?.columnName,
    currentSuggestions,
    oracleSuggestions,
    currentSuggestionDetails: [
      ...selectedColumnAudit.heuristicSuggestionDetails
    ],
    oracleSuggestionDetails: [...selectedColumnAudit.oracleSuggestionDetails],
    notes,
    issues,
    candidateColumns
  };
}

async function auditGeoFixture(
  db: TestDuckDB,
  fixtureLabel: string,
  absolutePath: string,
  importKind: 'geo' | 'zip-geo'
): Promise<DatasetAuditEntry> {
  const tableName = await importGeoFile(db, absolutePath);
  const rowCount = await getRowCount(db, tableName);
  const geometryColumn =
    (await getColumns(db, tableName)).find((column) =>
      String(column.data_type).toUpperCase().includes('GEOMETRY')
    )?.column_name ?? 'geom';
  const geometryInfo = await getGeometryInfo(db, tableName, geometryColumn);

  return {
    fixture: fixtureLabel,
    mode: 'custom-geometry',
    importKind,
    rowCount,
    geometryType: geometryInfo.geometryType,
    detectedGeoColumns: [],
    currentSuggestions: [],
    oracleSuggestions: [],
    notes: [],
    issues: geometryInfo.geometryType
      ? []
      : ['Geometry import produced no geometry type.']
  };
}

function writeZipEntriesToTempDir(zipPath: string): {
  dir: string;
  files: string[];
} {
  const dir = mkdtempSync(join(tmpdir(), 'khartis-audit-zip-'));
  const archive = unzipSync(readFileSync(zipPath));
  const writtenFiles: string[] = [];

  for (const [entryName, content] of Object.entries(archive)) {
    if (entryName.endsWith('/')) {
      continue;
    }
    if (basename(entryName).startsWith('.')) {
      continue;
    }

    const targetPath = join(dir, entryName);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, Buffer.from(content));
    writtenFiles.push(targetPath);
  }

  return { dir, files: writtenFiles };
}

async function auditPrimaryFile(
  db: TestDuckDB,
  duckClient: DuckDBClientForJoin,
  relativePath: string
): Promise<DatasetAuditEntry[]> {
  const absolutePath = join(ROOT, relativePath);
  const extension = extname(relativePath).toLowerCase();

  if (extension === '.csv') {
    return [
      await auditTabularFixture(
        db,
        duckClient,
        relativePath,
        absolutePath,
        'csv'
      )
    ];
  }

  if (extension === '.zip') {
    const extracted = writeZipEntriesToTempDir(absolutePath);
    try {
      const entries = extracted.files
        .map((file) => relative(extracted.dir, file).split('\\').join('/'))
        .filter((file) => !file.startsWith('__MACOSX/'));
      const shpEntry = entries.find((file) => file.endsWith('.shp'));
      const csvEntries = entries.filter((file) => file.endsWith('.csv'));

      if (shpEntry) {
        return [
          await auditGeoFixture(
            db,
            `${relativePath}::${shpEntry}`,
            join(extracted.dir, shpEntry),
            'zip-geo'
          )
        ];
      }

      return await Promise.all(
        csvEntries.map((entry) =>
          auditTabularFixture(
            db,
            duckClient,
            `${relativePath}::${entry}`,
            join(extracted.dir, entry),
            'zip-csv'
          )
        )
      );
    } finally {
      rmSync(extracted.dir, { recursive: true, force: true });
    }
  }

  return [await auditGeoFixture(db, relativePath, absolutePath, 'geo')];
}

function renderMarkdown(report: AuditReport): string {
  const lines = [
    '# Basemap Suggestions Audit',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    `Issue count: ${report.issueCount}`,
    '',
    '## Datasets',
    ''
  ];

  for (const dataset of report.primaryDatasets) {
    lines.push(`### ${dataset.fixture}`);
    lines.push(`- mode: ${dataset.mode}`);
    if (dataset.selectedGeoColumn) {
      lines.push(`- selectedGeoColumn: ${dataset.selectedGeoColumn}`);
    }
    if (dataset.bestGeoColumn) {
      lines.push(`- bestGeoColumn: ${dataset.bestGeoColumn}`);
    }
    if (dataset.currentSuggestions.length > 0) {
      lines.push(`- current: ${dataset.currentSuggestions.join(', ')}`);
    }
    if (dataset.oracleSuggestions.length > 0) {
      lines.push(`- oracle: ${dataset.oracleSuggestions.join(', ')}`);
    }
    if (dataset.issues.length > 0) {
      lines.push(`- issues: ${dataset.issues.join(' | ')}`);
    }
    if (dataset.notes.length > 0) {
      lines.push(`- notes: ${dataset.notes.join(' | ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

describe('temporary basemap suggestions audit', () => {
  beforeAll(async () => {
    db = await createTestInstance();
    await loadJoinMacros(db);
    await loadBasemapAttributes(db);
    catalogBasemaps = getCatalogBasemapsForDisplay(
      JSON.parse(
        readFileSync(BASEMAP_METADATA_PATH, 'utf8')
      ) as BasemapMetadata[]
    );
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('audits every tests-datasets fixture and writes a report', async () => {
    const allFiles = listFiles(ROOT).map(classifyFile);
    const primaryFiles = allFiles
      .filter((entry) => entry.category === 'primary')
      .map((entry) => entry.path);
    const duckClient = createDuckJoinClient(db);

    const datasetGroups = await Promise.all(
      primaryFiles.map((relativePath) =>
        auditPrimaryFile(db, duckClient, relativePath)
      )
    );
    const primaryDatasets = datasetGroups.flat();

    report = {
      generatedAt: new Date().toISOString(),
      allFiles,
      primaryDatasets,
      issueCount: primaryDatasets.reduce(
        (count, dataset) => count + dataset.issues.length,
        0
      )
    };

    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2));
    writeFileSync(REPORT_MD_PATH, renderMarkdown(report));

    expect(primaryDatasets.length).toBeGreaterThan(0);
  }, 180_000);
});
