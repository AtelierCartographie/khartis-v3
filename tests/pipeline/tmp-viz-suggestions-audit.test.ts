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
import {
  GeoColumnDetector,
  type GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';
import {
  type GeometryType,
  vizSuggester
} from '$lib/features/commons/services/viz-suggester.service';
import {
  SEMIO_TYPES,
  detectSemioType
} from '$lib/features/commons/utils/semio-detector.utils';
import { enrichColumns } from '$lib/features/data-pipeline/operations/analysis';
import {
  ColumnType,
  type ColumnAnalysis
} from '$lib/features/data-pipeline/types';
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
import {
  DuckDBSimplifiedType,
  FileType,
  type AnalysisResult as DuckDBAnalysisResult,
  type DuckDBDataset
} from '$lib/features/duckdb/types';
import {
  createTestInstance,
  destroyTestInstance,
  getColumns,
  getGeometryInfo,
  getRowCount,
  query,
  type TestDuckDB
} from './duckdb-node-helper';

vi.mock('$lib/features/map/services/basemap.service.svelte', async () => ({
  basemapService: {
    ensureAttributesLoaded: vi.fn(),
    loadGeometryIntoDuckDB: vi.fn()
  }
}));

vi.mock('$lib/features/map/utils/read-geojson-arrow', () => ({
  addGeoArrowMetadata: <T>(table: T) => table
}));

const ROOT = join(process.cwd(), 'static/tests-datasets');
const BASEMAP_ATTRIBUTES_PATH = join(
  process.cwd(),
  'static/basemaps/all-basemaps-attributes.parquet'
);
const REPORT_DIR = join(process.cwd(), 'tmp');
const REPORT_JSON_PATH = join(REPORT_DIR, 'viz-suggestions-audit-report.json');
const REPORT_MD_PATH = join(REPORT_DIR, 'viz-suggestions-audit-report.md');
const NULL_VALUES = `['', ':', '-', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'nil', 'NIL', 'none', 'NONE', 'None']`;
const JOIN_MATCH_THRESHOLD = 40;
const ID_KEYWORDS = [
  'id',
  'fid',
  'gid',
  'oid',
  'pk',
  'code',
  'iso',
  'objectid',
  'rowid'
];
const LAT_KEYWORDS = ['lat', 'latitude'];
const LON_KEYWORDS = ['lon', 'lng', 'long', 'longitude'];
const RATIO_KEYWORDS = [
  'ratio',
  'rate',
  'percent',
  'pct',
  '%',
  'pour',
  'taux',
  'share'
];

type AuditMode = 'tabular' | 'geographic' | 'no-geometry';

interface FileEntry {
  path: string;
  category: 'primary' | 'companion' | 'hidden-artifact' | 'unsupported';
}

interface OracleSynthesisRow {
  basemap: string;
  shareBasemap: number;
  shareCandidate: number;
  method: 'exact' | 'fuzzy';
}

interface SuggestionSummary {
  id: string;
  columns: string[];
  score: number;
}

interface SemioSummary {
  name: string;
  semioType: string;
  semioScore: number;
  uniques: number;
  count: number;
}

interface DatasetAuditEntry {
  fixture: string;
  importKind: 'csv' | 'geo' | 'zip-csv' | 'zip-geo';
  mode: AuditMode;
  geometryType: GeometryType | null;
  geometryReason: string;
  rowCount: number;
  detectedGeoColumns: Array<{
    columnName: string;
    type: string;
    confidence: number;
  }>;
  selectedGeoColumn?: string;
  bestGeoColumn?: string;
  topSuggestions: SuggestionSummary[];
  topSemioColumns: SemioSummary[];
  issues: string[];
  notes: string[];
}

interface AuditReport {
  generatedAt: string;
  allFiles: FileEntry[];
  issueCount: number;
  primaryDatasets: DatasetAuditEntry[];
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
let report: AuditReport;
let tableCounter = 0;

interface RankedSemioColumn extends SemioSummary {
  nulls: number;
}

function sqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeIdentifier(value: string): string {
  return value.replace(/"/g, '""');
}

function normalizeColumnType(columnType: ColumnAnalysis['type']): string {
  if (columnType === ColumnType.NUMBER) {
    return 'number';
  }
  if (columnType === ColumnType.DATE) {
    return 'date';
  }
  if (columnType === ColumnType.BOOLEAN) {
    return 'boolean';
  }
  return 'text';
}

function tokenizeColumnName(columnName: string): string[] {
  return columnName
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter(Boolean);
}

function hasKeyword(columnName: string, keywords: readonly string[]): boolean {
  const tokens = tokenizeColumnName(columnName);
  return (
    tokens.some((token) => keywords.includes(token)) ||
    keywords.some((keyword) => columnName.toLowerCase().includes(keyword))
  );
}

function toSemioAnalysis(column: ColumnAnalysis): DuckDBAnalysisResult {
  const min =
    typeof column.stats?.min === 'number' || column.stats?.min instanceof Date
      ? column.stats.min
      : undefined;
  const max =
    typeof column.stats?.max === 'number' || column.stats?.max instanceof Date
      ? column.stats.max
      : undefined;

  return {
    name: column.name ?? '',
    type_simple:
      normalizeColumnType(column.type) === 'number'
        ? DuckDBSimplifiedType.NUMERIC
        : normalizeColumnType(column.type) === 'date'
          ? DuckDBSimplifiedType.DATE
          : DuckDBSimplifiedType.STRING,
    count: column.stats?.count ?? column.stats?.totalCount ?? 0,
    uniques: column.stats?.uniques ?? column.stats?.uniqueCount ?? 0,
    nulls: column.stats?.nulls ?? column.stats?.nullCount ?? 0,
    min,
    max,
    share_integers: column.stats?.share_integers,
    share_floats: column.stats?.share_floats,
    share_rank_interval: column.stats?.share_rank_interval,
    extent_magnitude: column.stats?.extent_magnitude
  };
}

function summarizeSemioColumns(columns: ColumnAnalysis[]): RankedSemioColumn[] {
  return columns
    .map((column) => {
      const semio = detectSemioType(toSemioAnalysis(column));
      return {
        name: String(column.name ?? ''),
        semioType: semio.semioType,
        semioScore: semio.semioScore,
        uniques: Number(
          column.stats?.uniques ?? column.stats?.uniqueCount ?? 0
        ),
        count: Number(column.stats?.count ?? column.stats?.totalCount ?? 0),
        nulls: Number(column.stats?.nulls ?? column.stats?.nullCount ?? 0)
      };
    })
    .filter((column) => column.semioType !== SEMIO_TYPES.GEOLAT)
    .filter((column) => column.semioType !== SEMIO_TYPES.GEOLON)
    .sort((left, right) => {
      const scoreDelta = right.semioScore - left.semioScore;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return left.nulls - right.nulls;
    });
}

function isThematicSemioType(semioType: string): boolean {
  return (
    semioType === SEMIO_TYPES.QTA ||
    semioType === SEMIO_TYPES.QTR ||
    semioType === SEMIO_TYPES.QL ||
    semioType === SEMIO_TYPES.QLO
  );
}

function getExpectedSuggestionIds(
  geometryType: GeometryType,
  semioType: string
): string[] {
  const lowerGeometry = geometryType.toLowerCase();

  if (semioType === SEMIO_TYPES.QTA) {
    if (lowerGeometry.includes('line')) {
      return [
        'lines_proportional',
        'lines_proportional_colorful_QL',
        'lines_proportional_colorful_QTR'
      ];
    }

    return [
      'symbols_proportional',
      'symbols_proportional_colorful_QL',
      'symbols_proportional_colorful_QTR',
      'symbols_proportional_double',
      'texts_proportional'
    ];
  }

  if (semioType === SEMIO_TYPES.QTR) {
    if (lowerGeometry.includes('line')) {
      return ['lines_colorful_QTR', 'lines_proportional_colorful_QTR'];
    }
    if (lowerGeometry.includes('polygon')) {
      return ['choropleth', 'symbols_proportional_colorful_QTR'];
    }

    return [
      'symbols_uniques_colorful_QTR',
      'symbols_proportional_colorful_QTR'
    ];
  }

  if (semioType === SEMIO_TYPES.QL) {
    if (lowerGeometry.includes('line')) {
      return ['lines_colorful_QL', 'lines_proportional_colorful_QL'];
    }
    if (lowerGeometry.includes('polygon')) {
      return ['polygons_colorful_QL', 'symbols_proportional_colorful_QL'];
    }

    return [
      'symbols_uniques_colorful_QL',
      'symbols_differents',
      'symbols_proportional_colorful_QL',
      'texts_colorful_QL'
    ];
  }

  if (semioType === SEMIO_TYPES.QLO) {
    if (lowerGeometry.includes('line')) {
      return ['lines_colorful_QLO'];
    }
    if (lowerGeometry.includes('polygon')) {
      return ['polygons_colorful_QLO'];
    }

    return ['symbols_uniques_colorful_QLO', 'symbols_differents_QLO'];
  }

  return [];
}

function collectSuggestionIssues(
  geometryType: GeometryType | null,
  suggestions: SuggestionSummary[],
  rankedColumns: RankedSemioColumn[],
  columns: ColumnAnalysis[]
): string[] {
  if (!geometryType) {
    return suggestions.length > 0
      ? ['dataset-without-geometry-returned-visualization-suggestions']
      : [];
  }

  const issues: string[] = [];
  const thematicColumns = rankedColumns.filter(
    (column) => isThematicSemioType(column.semioType) && column.uniques > 1
  );
  const likelyThematicSemios = columns
    .map((column) => {
      const name = String(column.name ?? '');
      if (hasKeyword(name, ID_KEYWORDS)) return null;
      if (hasKeyword(name, LAT_KEYWORDS) || hasKeyword(name, LON_KEYWORDS)) {
        return null;
      }

      const uniques = Number(
        column.stats?.uniques ?? column.stats?.uniqueCount ?? 0
      );

      if (normalizeColumnType(column.type) === 'number' && uniques > 1) {
        return hasKeyword(name, RATIO_KEYWORDS)
          ? SEMIO_TYPES.QTR
          : SEMIO_TYPES.QTA;
      }

      if (
        (normalizeColumnType(column.type) === 'text' ||
          normalizeColumnType(column.type) === 'date') &&
        uniques > 1 &&
        uniques <= 12
      ) {
        return SEMIO_TYPES.QL;
      }

      return null;
    })
    .flatMap((semioType) => (semioType ? [semioType] : []));

  if (suggestions.length === 0) {
    issues.push('dataset-with-geometry-returned-no-visualization-suggestions');
    return issues;
  }

  const thematicSuggestions = suggestions.filter(
    (suggestion) => suggestion.columns.length > 0
  );

  if (thematicColumns.length === 0) {
    if (thematicSuggestions.length > 0) {
      issues.push(
        'geometry-only-dataset-returned-thematic-suggestions-without-usable-columns'
      );
    }
    return issues;
  }

  if (thematicSuggestions.length === 0) {
    issues.push('thematic-columns-did-not-produce-any-thematic-suggestion');
  }

  if (thematicSuggestions.length === 0 && likelyThematicSemios.length > 0) {
    issues.push(
      'likely-thematic-columns-did-not-produce-any-thematic-suggestion'
    );
  }

  if (suggestions[0]?.columns.length === 0) {
    issues.push(
      'geometry-only-suggestion-ranked-first-despite-thematic-columns'
    );
  }

  const bestThematicColumn = thematicColumns[0];
  const expectedSuggestionIds = getExpectedSuggestionIds(
    geometryType,
    bestThematicColumn.semioType
  );

  if (
    expectedSuggestionIds.length > 0 &&
    !suggestions
      .slice(0, 3)
      .some((suggestion) => expectedSuggestionIds.includes(suggestion.id))
  ) {
    issues.push(
      `best-semio-${bestThematicColumn.semioType.toLowerCase()}-missing-expected-family:${bestThematicColumn.name}`
    );
  }

  return issues;
}

function uniqueTableName(prefix: string): string {
  tableCounter += 1;
  return `viz_audit_${prefix}_${tableCounter}`.replace(/[^a-zA-Z0-9_]/g, '_');
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

function listFiles(dir: string, rootDir: string = dir): string[] {
  return readDirRecursive(dir)
    .map((absolutePath) =>
      relative(rootDir, absolutePath).split('\\').join('/')
    )
    .sort();
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

async function loadJoinMacros(testDb: TestDuckDB): Promise<void> {
  const macroStatements = join_macros
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of macroStatements) {
    await testDb.connection.run(`${statement};`);
  }
}

async function loadBasemapAttributes(testDb: TestDuckDB): Promise<void> {
  await testDb.connection.run(`
    CREATE OR REPLACE TABLE basemap_attributes AS
    SELECT * FROM read_parquet('${sqlQuote(BASEMAP_ATTRIBUTES_PATH)}')
  `);
  await testDb.connection.run(
    `UPDATE basemap_attributes SET id = raw WHERE variant = id`
  );
}

function createDuckJoinClient(testDb: TestDuckDB): DuckDBClientForJoin {
  return {
    async query(sql: string): Promise<unknown> {
      return query(testDb, sql);
    },
    async join_by_id(): Promise<unknown> {
      throw new Error('join_by_id is not used in visualization audit');
    },
    async apply_join_association(): Promise<unknown> {
      throw new Error(
        'apply_join_association is not used in visualization audit'
      );
    }
  };
}

async function importCsvLike(
  testDb: TestDuckDB,
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

  try {
    await testDb.connection.run(`
      CREATE OR REPLACE TABLE "${tableName}" AS
      FROM read_csv('${sqlQuote(absolutePath)}', ${options.join(', ')})
    `);
  } catch {
    await testDb.connection.run(`
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
  testDb: TestDuckDB,
  absolutePath: string
): Promise<string> {
  const tableName = uniqueTableName(basename(absolutePath));
  await testDb.connection.run(`
    CREATE OR REPLACE TABLE "${tableName}" AS
    FROM ST_Read('${sqlQuote(absolutePath)}')
  `);
  return tableName;
}

async function getSampleMatrix(
  testDb: TestDuckDB,
  tableName: string,
  columns: string[],
  limit: number = 200
): Promise<unknown[][]> {
  if (columns.length === 0) {
    return [];
  }

  const escapedColumns = columns
    .map((column) => `"${escapeIdentifier(column)}"`)
    .join(', ');
  const rows = await query(
    testDb,
    `SELECT ${escapedColumns} FROM "${escapeIdentifier(tableName)}" LIMIT ${limit}`
  );

  return rows.map((row) => columns.map((column) => row[column]));
}

async function getFullAnalysisRows(
  testDb: TestDuckDB,
  tableName: string
): Promise<Array<Record<string, unknown>>> {
  const describeRows = await query(
    testDb,
    `FROM describe_full('${sqlQuote(tableName)}')`
  );
  const analysisRows: Array<Record<string, unknown>> = [];

  for (const column of describeRows) {
    const columnName = String(column.name ?? '');
    const escapedColumnName = escapeIdentifier(columnName);
    const general =
      (
        await query(
          testDb,
          `FROM summary_general('${sqlQuote(tableName)}', "${escapedColumnName}")`
        )
      )[0] ?? {};

    let specific: Record<string, unknown> = {};
    if (column.type_simple === 'numeric') {
      specific =
        (
          await query(
            testDb,
            `FROM summary_numeric('${sqlQuote(tableName)}', "${escapedColumnName}")`
          )
        )[0] ?? {};
    } else if (column.type_simple === 'date') {
      specific =
        (
          await query(
            testDb,
            `FROM summary_date('${sqlQuote(tableName)}', "${escapedColumnName}")`
          )
        )[0] ?? {};
    }

    analysisRows.push({
      ...column,
      ...general,
      ...specific
    });
  }

  return analysisRows;
}

async function computeExactJoinSynthesis(
  testDb: TestDuckDB,
  tableName: string,
  geoColumn: string
): Promise<OracleSynthesisRow[]> {
  const escapedGeoColumn = geoColumn.replace(/"/g, '""');
  const rows = (await query(
    testDb,
    `WITH candidates AS (
       SELECT DISTINCT normalize_text_join(CAST("${escapedGeoColumn}" AS VARCHAR)) AS normalized
       FROM "${escapeIdentifier(tableName)}"
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

async function countDistinctCandidates(
  testDb: TestDuckDB,
  tableName: string,
  geoColumn: string
): Promise<number> {
  const escapedGeoColumn = geoColumn.replace(/"/g, '""');
  const rows = await query(
    testDb,
    `SELECT COUNT(DISTINCT normalize_text_join(CAST("${escapedGeoColumn}" AS VARCHAR))) AS cnt
     FROM "${escapeIdentifier(tableName)}"
     WHERE "${escapedGeoColumn}" IS NOT NULL
       AND trim(CAST("${escapedGeoColumn}" AS VARCHAR)) != ''`
  );
  return Number(rows[0]?.cnt ?? 0);
}

async function computeOracleSynthesis(
  testDb: TestDuckDB,
  duckClient: DuckDBClientForJoin,
  dataset: DuckDBDataset,
  geoColumn: string
): Promise<OracleSynthesisRow[]> {
  const exactRows = await computeExactJoinSynthesis(
    testDb,
    dataset.tableName,
    geoColumn
  );
  const bestExact = exactRows[0]?.shareCandidate ?? 0;
  const distinctCandidates = await countDistinctCandidates(
    testDb,
    dataset.tableName,
    geoColumn
  );

  if (bestExact > 0 || distinctCandidates > 500) {
    return exactRows;
  }

  const fuzzyRows = await computeJoinSynthesis(dataset, geoColumn, duckClient);
  return fuzzyRows.map((row) => ({
    basemap: row.basemap,
    shareBasemap: row.shareBasemap,
    shareCandidate: row.shareCandidate,
    method: 'fuzzy'
  }));
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

function normalizeGeometryType(
  rawGeometryType: string | null
): GeometryType | null {
  if (!rawGeometryType) {
    return null;
  }

  const upper = rawGeometryType.toUpperCase();
  if (upper.includes('POINT'))
    return upper.startsWith('MULTI') ? 'MultiPoint' : 'Point';
  if (upper.includes('LINESTRING')) {
    return upper.startsWith('MULTI') ? 'MultiLineString' : 'LineString';
  }
  if (upper.includes('POLYGON')) {
    return upper.startsWith('MULTI') ? 'MultiPolygon' : 'Polygon';
  }
  return null;
}

async function inferTabularGeometry(
  testDb: TestDuckDB,
  duckClient: DuckDBClientForJoin,
  tableName: string,
  columns: string[],
  rowCount: number,
  geoDetection: GeoDetectionResult
): Promise<{
  geometryType: GeometryType | null;
  geometryReason: string;
  bestGeoColumn?: string;
}> {
  const duckDataset = createDuckDataset(
    tableName,
    columns,
    rowCount,
    geoDetection
  );
  const hasGPSColumns =
    geoDetection.geoColumns.some((column) => column.type === 'latitude') &&
    geoDetection.geoColumns.some((column) => column.type === 'longitude');

  if (hasGPSColumns) {
    const latColumn =
      geoDetection.geoColumns.find((column) => column.type === 'latitude')
        ?.columnName ?? '';
    const lonColumn =
      geoDetection.geoColumns.find((column) => column.type === 'longitude')
        ?.columnName ?? '';

    const validation = await validateGPSColumns(
      tableName,
      latColumn,
      lonColumn,
      {
        query: async (sql: string) => query(testDb, sql)
      }
    );
    const gpsBounds = await getGPSBounds(duckDataset, {
      query: async (sql: string) => query(testDb, sql)
    });

    if (gpsBounds && validation.isValid) {
      return {
        geometryType: 'Point',
        geometryReason: `gps:${latColumn}/${lonColumn}`
      };
    }
  }

  const candidateGeoColumns = geoDetection.geoColumns.filter(
    (column) => column.type !== 'latitude' && column.type !== 'longitude'
  );

  let bestGeoColumn: string | undefined;
  let bestShareCandidate = 0;

  for (const column of candidateGeoColumns) {
    const oracle = await computeOracleSynthesis(
      testDb,
      duckClient,
      duckDataset,
      column.columnName
    );
    const shareCandidate = oracle[0]?.shareCandidate ?? 0;
    if (shareCandidate > bestShareCandidate) {
      bestShareCandidate = shareCandidate;
      bestGeoColumn = column.columnName;
    }
  }

  if (bestGeoColumn && bestShareCandidate >= JOIN_MATCH_THRESHOLD) {
    return {
      geometryType: 'Polygon',
      geometryReason: `join:${bestGeoColumn}:${bestShareCandidate.toFixed(2)}%`,
      bestGeoColumn
    };
  }

  return {
    geometryType: null,
    geometryReason: 'no-usable-geometry',
    bestGeoColumn
  };
}

function summarizeSuggestions(
  analysisRows: Array<Record<string, unknown>>,
  geometryType: GeometryType | null
): {
  suggestions: SuggestionSummary[];
  topSemioColumns: SemioSummary[];
  issues: string[];
} {
  const enrichedColumns = enrichColumns(analysisRows as never);
  const rankedColumns = summarizeSemioColumns(enrichedColumns);

  const suggestions = geometryType
    ? vizSuggester.suggestVisualizations(enrichedColumns, geometryType, {
        maxSuggestions: 12
      })
    : [];
  const issues = collectSuggestionIssues(
    geometryType,
    suggestions.map((suggestion) => ({
      id: suggestion.id,
      columns: suggestion.columns ?? [],
      score: suggestion.score ?? 0
    })),
    rankedColumns,
    enrichedColumns
  );

  return {
    suggestions: suggestions.map((suggestion) => ({
      id: suggestion.id,
      columns: suggestion.columns ?? [],
      score: suggestion.score ?? 0
    })),
    topSemioColumns: rankedColumns
      .slice(0, 8)
      .map(({ nulls: _nulls, ...rest }) => rest),
    issues
  };
}

async function auditTabularFixture(
  testDb: TestDuckDB,
  duckClient: DuckDBClientForJoin,
  fixtureLabel: string,
  absolutePath: string,
  importKind: 'csv' | 'zip-csv'
): Promise<DatasetAuditEntry> {
  const tableName = await importCsvLike(testDb, absolutePath);
  const rowCount = await getRowCount(testDb, tableName);
  const columns = (await getColumns(testDb, tableName)).map(
    (column) => column.column_name
  );
  const matrix = await getSampleMatrix(testDb, tableName, columns);
  const geoDetection = await GeoColumnDetector.detectGeoColumns(
    columns,
    matrix
  );
  const analysisRows = await getFullAnalysisRows(testDb, tableName);
  const inferredGeometry = await inferTabularGeometry(
    testDb,
    duckClient,
    tableName,
    columns,
    rowCount,
    geoDetection
  );
  const { suggestions, topSemioColumns, issues } = summarizeSuggestions(
    analysisRows,
    inferredGeometry.geometryType
  );

  return {
    fixture: fixtureLabel,
    importKind,
    mode: inferredGeometry.geometryType ? 'tabular' : 'no-geometry',
    geometryType: inferredGeometry.geometryType,
    geometryReason: inferredGeometry.geometryReason,
    rowCount,
    detectedGeoColumns: geoDetection.geoColumns.map((column) => ({
      columnName: column.columnName,
      type: column.type,
      confidence: Number(column.confidence.toFixed(3))
    })),
    selectedGeoColumn: geoDetection.suggestedPrimaryGeoColumn?.columnName,
    bestGeoColumn: inferredGeometry.bestGeoColumn,
    topSuggestions: suggestions,
    topSemioColumns,
    issues,
    notes: []
  };
}

async function auditGeoFixture(
  testDb: TestDuckDB,
  fixtureLabel: string,
  absolutePath: string,
  importKind: 'geo' | 'zip-geo'
): Promise<DatasetAuditEntry> {
  const tableName = await importGeoFile(testDb, absolutePath);
  const rowCount = await getRowCount(testDb, tableName);
  const geometryColumn =
    (await getColumns(testDb, tableName)).find((column) =>
      String(column.data_type).toUpperCase().includes('GEOMETRY')
    )?.column_name ?? 'geom';
  const geometryInfo = await getGeometryInfo(testDb, tableName, geometryColumn);
  const analysisRows = await getFullAnalysisRows(testDb, tableName);
  const geometryType = normalizeGeometryType(geometryInfo.geometryType);
  const { suggestions, topSemioColumns, issues } = summarizeSuggestions(
    analysisRows,
    geometryType
  );

  return {
    fixture: fixtureLabel,
    importKind,
    mode: geometryType ? 'geographic' : 'no-geometry',
    geometryType,
    geometryReason: geometryType
      ? `geometry:${geometryInfo.geometryType}`
      : 'missing-geometry-type',
    rowCount,
    detectedGeoColumns: [],
    topSuggestions: suggestions,
    topSemioColumns,
    issues,
    notes: []
  };
}

function writeZipEntriesToTempDir(zipPath: string): {
  dir: string;
  files: string[];
} {
  const dir = mkdtempSync(join(tmpdir(), 'khartis-viz-audit-zip-'));
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
  testDb: TestDuckDB,
  duckClient: DuckDBClientForJoin,
  relativePath: string
): Promise<DatasetAuditEntry[]> {
  const absolutePath = join(ROOT, relativePath);
  const extension = extname(relativePath).toLowerCase();

  if (extension === '.csv') {
    return [
      await auditTabularFixture(
        testDb,
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
      const audits: DatasetAuditEntry[] = [];

      for (const entry of entries) {
        const entryPath = join(extracted.dir, entry);
        const entryLabel = `${relativePath}::${entry}`;
        const entryExtension = extname(entry).toLowerCase();

        if (entryExtension === '.csv') {
          audits.push(
            await auditTabularFixture(
              testDb,
              duckClient,
              entryLabel,
              entryPath,
              'zip-csv'
            )
          );
        } else if (
          ['.geojson', '.gpkg', '.gpx', '.kml', '.shp'].includes(entryExtension)
        ) {
          audits.push(
            await auditGeoFixture(testDb, entryLabel, entryPath, 'zip-geo')
          );
        }
      }

      return audits;
    } finally {
      rmSync(extracted.dir, { recursive: true, force: true });
    }
  }

  return [await auditGeoFixture(testDb, relativePath, absolutePath, 'geo')];
}

function writeReport(auditReport: AuditReport): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(auditReport, null, 2));

  const lines: string[] = [
    '# Visualization Suggestions Audit',
    '',
    `Generated at: ${auditReport.generatedAt}`,
    `Issue count: ${auditReport.issueCount}`,
    '',
    '## Datasets',
    ''
  ];

  for (const dataset of auditReport.primaryDatasets) {
    lines.push(`### ${dataset.fixture}`);
    lines.push(`- mode: ${dataset.mode}`);
    lines.push(`- geometryType: ${dataset.geometryType ?? 'none'}`);
    lines.push(`- geometryReason: ${dataset.geometryReason}`);
    if (dataset.selectedGeoColumn) {
      lines.push(`- selectedGeoColumn: ${dataset.selectedGeoColumn}`);
    }
    if (dataset.bestGeoColumn) {
      lines.push(`- bestGeoColumn: ${dataset.bestGeoColumn}`);
    }
    if (dataset.topSuggestions.length > 0) {
      lines.push(
        `- suggestions: ${dataset.topSuggestions
          .map(
            (suggestion) =>
              `${suggestion.id}${suggestion.columns.length ? `(${suggestion.columns.join(', ')})` : ''}:${suggestion.score}`
          )
          .join(' | ')}`
      );
    }
    if (dataset.topSemioColumns.length > 0) {
      lines.push(
        `- topSemio: ${dataset.topSemioColumns
          .map(
            (column) =>
              `${column.name}:${column.semioType}:${column.semioScore}`
          )
          .join(' | ')}`
      );
    }
    if (dataset.issues.length > 0) {
      lines.push(`- issues: ${dataset.issues.join(' | ')}`);
    }
    lines.push('');
  }

  writeFileSync(REPORT_MD_PATH, lines.join('\n'));
}

describe('temporary visualization suggestions audit', () => {
  beforeAll(async () => {
    db = await createTestInstance();
    await loadJoinMacros(db);
    await loadBasemapAttributes(db);

    const allFiles = listFiles(ROOT).map((path) => classifyFile(path));
    const primaryFiles = allFiles
      .filter((entry) => entry.category === 'primary')
      .map((entry) => entry.path);
    const duckClient = createDuckJoinClient(db);
    const primaryDatasets: DatasetAuditEntry[] = [];

    for (const relativePath of primaryFiles) {
      primaryDatasets.push(
        ...(await auditPrimaryFile(db, duckClient, relativePath))
      );
    }

    report = {
      generatedAt: new Date().toISOString(),
      allFiles,
      issueCount: primaryDatasets.reduce(
        (count, dataset) => count + dataset.issues.length,
        0
      ),
      primaryDatasets
    };

    writeReport(report);
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('writes a complete audit report for all primary test datasets', () => {
    expect(report.primaryDatasets.length).toBeGreaterThan(0);
    expect(report.issueCount).toBe(0);
    expect(readFileSync(REPORT_JSON_PATH, 'utf8')).toContain(
      '"primaryDatasets"'
    );
  });
});
