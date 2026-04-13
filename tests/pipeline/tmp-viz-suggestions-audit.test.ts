import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, extname, join, relative } from 'path';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  DuckDBSimplifiedType: {
    NUMERIC: 'numeric',
    DATE: 'date',
    STRING: 'string',
    GEOMETRY: 'geometry',
    OTHER: 'other'
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    VISUALIZATION: 'VISUALIZATION'
  },
  logger: {
    debug: vi.fn()
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  viz_suggestion_symbols_uniques: () => 'Symboles uniques',
  viz_suggestion_polygons_colorful_ql: () => 'Aplats de couleur (qualitatif)',
  viz_suggestion_choropleth: () => 'Choroplèthe',
  viz_suggestion_symbols_unique_colorful_qtr: () =>
    'Symboles uniques colorés (quantitatif)',
  viz_suggestion_symbols_different_ql: () => 'Symboles différents (qualitatif)',
  viz_suggestion_symbols_unique_colorful_ql: () =>
    'Symboles colorés (qualitatif)',
  viz_suggestion_symbols_proportional: () => 'Symboles proportionnels',
  viz_suggestion_symbols_proportional_colorful_ql: () =>
    'Symboles proportionnels colorés (qualitatif)',
  viz_suggestion_symbols_proportional_colorful_qtr: () =>
    'Symboles proportionnels colorés (quantitatif)',
  viz_suggestion_symbols_proportional_double: () =>
    'Double symboles proportionnels',
  viz_suggestion_polygons_unique: () => 'Polygones uniques',
  viz_suggestion_lines_unique: () => 'Lignes uniques',
  viz_suggestion_lines_colorful_ql: () => 'Lignes colorées (qualitatif)',
  viz_suggestion_lines_colorful_qtr: () => 'Lignes colorées (quantitatif)',
  viz_suggestion_lines_proportional: () => 'Lignes proportionnelles',
  viz_suggestion_lines_proportional_colorful_ql: () =>
    'Lignes proportionnelles colorées (qualitatif)',
  viz_suggestion_lines_proportional_colorful_qtr: () =>
    'Lignes proportionnelles colorées (quantitatif)',
  viz_suggestion_polygons_colorful_qlo: () =>
    'Aplats de couleur (qualitatif ordonné)',
  viz_suggestion_symbols_different_qlo: () =>
    'Symboles différents (qualitatif ordonné)',
  viz_suggestion_symbols_unique_colorful_qlo: () =>
    'Symboles colorés (qualitatif ordonné)',
  viz_suggestion_lines_colorful_qlo: () =>
    'Lignes colorées (qualitatif ordonné)',
  viz_suggestion_texts_colorful_ql: () => 'Textes colorés (qualitatif)',
  viz_suggestion_texts_colorful_qtr: () => 'Textes colorés (quantitatif)',
  viz_suggestion_texts_proportional: () => 'Textes proportionnels'
}));

import {
  GeoColumnDetector,
  type GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';
import {
  vizSuggester,
  type GeometryType,
  type VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import { detectCsvHeader } from '$lib/features/data-pipeline/utils/csv-header-detector';
import {
  detectDecimalSeparator,
  readFileHead
} from '$lib/features/data-pipeline/utils/decimal-detector';
import { DuckDBSimplifiedType } from '$lib/features/duckdb/types';
import type { ColumnAnalysis } from '$lib/features/data-pipeline/types';
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
const BASEMAP_REPORT_JSON_PATH = join(
  process.cwd(),
  'tmp/basemap-suggestions-audit-report.json'
);
const REPORT_DIR = join(process.cwd(), 'tmp');
const REPORT_JSON_PATH = join(REPORT_DIR, 'viz-suggestions-audit-report.json');
const REPORT_MD_PATH = join(REPORT_DIR, 'viz-suggestions-audit-report.md');
const NULL_VALUES = `['', ':', '-', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'nil', 'NIL', 'none', 'NONE', 'None']`;

type AuditImportKind = 'csv' | 'geo' | 'zip-csv' | 'zip-geo';

interface FileEntry {
  path: string;
  category: 'primary' | 'companion' | 'hidden-artifact' | 'unsupported';
}

interface BasemapAuditDataset {
  fixture: string;
  mode:
    | 'catalog-gps'
    | 'catalog-text'
    | 'catalog-text-fallback'
    | 'no-geo-suggestion'
    | 'custom-geometry';
  geometryType?: string | null;
  currentSuggestions: string[];
  oracleSuggestions: string[];
  detectedGeoColumns: Array<{
    columnName: string;
    type: string;
    confidence: number;
  }>;
}

interface BasemapAuditReport {
  generatedAt: string;
  allFiles: FileEntry[];
  primaryDatasets: BasemapAuditDataset[];
  issueCount: number;
}

interface VizSuggestionSnapshot {
  id: string;
  label: string;
  score: number;
  nbColumns: number;
  columns: string[];
  geometries: string[];
}

interface VizDatasetAuditEntry {
  fixture: string;
  importKind: AuditImportKind;
  rowCount: number;
  geometryType: GeometryType | null;
  basemapMode: BasemapAuditDataset['mode'] | 'unknown';
  columnCount: number;
  detectedGeoColumns: Array<{
    columnName: string;
    type: string;
    confidence: number;
  }>;
  defaultSuggestionId?: string;
  defaultSuggestionScore?: number;
  suggestions: VizSuggestionSnapshot[];
  initialVisibleSuggestionIds: string[];
  notes: string[];
  issues: string[];
}

interface VizAuditReport {
  generatedAt: string;
  allFiles: FileEntry[];
  primaryDatasets: VizDatasetAuditEntry[];
  issueCount: number;
}

const PRIMARY_RULES = [
  { prefix: 'csv/', extension: '.csv' },
  { prefix: 'geojson/', extension: '.geojson' },
  { prefix: 'gpkg/', extension: '.gpkg' },
  { prefix: 'gpx/', extension: '.gpx' },
  { prefix: 'kml-kmz/', extension: '.kml' },
  { prefix: 'shp/', extension: '.shp' },
  { prefix: 'zip/', extension: '.zip' }
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
let basemapReport: BasemapAuditReport;
let report: VizAuditReport;
let tableCounter = 0;

function sqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function uniqueTableName(prefix: string): string {
  tableCounter += 1;
  return `audit_viz_${prefix}_${tableCounter}`.replace(/[^a-zA-Z0-9_]/g, '_');
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

function mapTypeJsToColumnType(typeJs: unknown): string {
  switch (String(typeJs ?? 'string').toLowerCase()) {
    case 'bigint':
      return 'bigint';
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

async function getColumnAnalyses(
  db: TestDuckDB,
  tableName: string
): Promise<ColumnAnalysis[]> {
  const describeRows = await query(
    db,
    `FROM describe_full('${sqlQuote(tableName)}')`
  );

  const analyses: ColumnAnalysis[] = [];

  for (const row of describeRows) {
    if (row.type_simple === DuckDBSimplifiedType.GEOMETRY) {
      continue;
    }

    const escapedColumnName = String(row.name).replace(/"/g, '""');
    const generalRows = await query(
      db,
      `FROM summary_general('${sqlQuote(tableName)}', "${escapedColumnName}")`
    );
    const specificRows =
      row.type_simple === DuckDBSimplifiedType.NUMERIC
        ? await query(
            db,
            `FROM summary_numeric('${sqlQuote(tableName)}', "${escapedColumnName}")`
          )
        : row.type_simple === DuckDBSimplifiedType.DATE
          ? await query(
              db,
              `FROM summary_date('${sqlQuote(tableName)}', "${escapedColumnName}")`
            )
          : [];

    const merged = {
      ...row,
      ...(generalRows[0] ?? {}),
      ...(specificRows[0] ?? {})
    };

    analyses.push({
      name: String(merged.name ?? ''),
      type: mapTypeJsToColumnType(merged.type_js),
      stats: {
        count: Number(merged.count ?? 0),
        nulls: Number(merged.nulls ?? 0),
        uniques: Number(merged.uniques ?? 0),
        min: merged.min,
        max: merged.max,
        mean: toNumberOrUndefined(merged.mean),
        share_integers: toNumberOrUndefined(merged.share_integers),
        share_floats: toNumberOrUndefined(merged.share_floats),
        share_rank_interval: toNumberOrUndefined(merged.share_rank_interval),
        extent_magnitude: toNumberOrUndefined(merged.extent_magnitude)
      }
    });
  }

  return analyses;
}

function normalizeGeometryType(
  rawGeometryType?: string | null
): GeometryType | null {
  if (!rawGeometryType) {
    return null;
  }

  const upper = rawGeometryType.toUpperCase();
  if (upper.includes('MULTIPOINT')) return 'MultiPoint';
  if (upper.includes('POINT')) return 'Point';
  if (upper.includes('MULTILINESTRING')) return 'MultiLineString';
  if (upper.includes('LINESTRING')) return 'LineString';
  if (upper.includes('MULTIPOLYGON')) return 'MultiPolygon';
  if (upper.includes('POLYGON')) return 'Polygon';
  return null;
}

function inferGeometryType(
  basemapAudit: BasemapAuditDataset | undefined,
  geoDetection: GeoDetectionResult,
  importedGeometryType?: string | null
): GeometryType | null {
  if (basemapAudit?.mode === 'custom-geometry') {
    return normalizeGeometryType(
      importedGeometryType ?? basemapAudit.geometryType ?? null
    );
  }

  const hasLatitude = geoDetection.geoColumns.some(
    (column) => column.type === 'latitude'
  );
  const hasLongitude = geoDetection.geoColumns.some(
    (column) => column.type === 'longitude'
  );

  if (hasLatitude && hasLongitude) {
    return 'Point';
  }

  if (
    basemapAudit &&
    (basemapAudit.currentSuggestions.length > 0 ||
      basemapAudit.oracleSuggestions.length > 0)
  ) {
    return 'Polygon';
  }

  return null;
}

function snapshotSuggestions(
  suggestions: VizSuggestion[]
): VizSuggestionSnapshot[] {
  return suggestions.map((suggestion) => ({
    id: suggestion.id,
    label: suggestion.label,
    score: suggestion.score ?? 0,
    nbColumns: suggestion.nbColumns,
    columns: suggestion.columns ?? [],
    geometries: [...suggestion.geometries]
  }));
}

function validateSuggestions(
  suggestions: VizSuggestion[],
  geometryType: GeometryType | null
): string[] {
  const issues: string[] = [];

  if (!geometryType) {
    if (suggestions.length > 0) {
      issues.push('Suggestions produced without a resolved geometry type.');
    }
    return issues;
  }

  if (suggestions.length === 0) {
    issues.push(
      'No suggestions produced for a dataset with a resolved geometry type.'
    );
    return issues;
  }

  const topScore = suggestions[0]?.score ?? 0;
  const maxScore = Math.max(
    ...suggestions.map((suggestion) => suggestion.score ?? 0)
  );
  if (topScore !== maxScore) {
    issues.push(
      `Top suggestion is not the highest score (${topScore} vs ${maxScore}).`
    );
  }

  return issues;
}

async function auditDatasetFixture(params: {
  fixtureLabel: string;
  absolutePath: string;
  importKind: AuditImportKind;
  basemapAudit?: BasemapAuditDataset;
}): Promise<VizDatasetAuditEntry> {
  const { fixtureLabel, absolutePath, importKind, basemapAudit } = params;

  const tableName =
    importKind === 'csv' || importKind === 'zip-csv'
      ? await importCsvLike(db, absolutePath)
      : await importGeoFile(db, absolutePath);

  const rowCount = await getRowCount(db, tableName);
  const allColumns = await getColumns(db, tableName);
  const dataColumns = allColumns
    .filter(
      (column) => !String(column.data_type).toUpperCase().includes('GEOMETRY')
    )
    .map((column) => column.column_name);
  const sampleMatrix = await getSampleMatrix(db, tableName, dataColumns);
  const geoDetection = await GeoColumnDetector.detectGeoColumns(
    dataColumns,
    sampleMatrix
  );
  const geometryColumn =
    allColumns.find((column) =>
      String(column.data_type).toUpperCase().includes('GEOMETRY')
    )?.column_name ?? 'geom';
  const geometryInfo =
    importKind === 'geo' || importKind === 'zip-geo'
      ? await getGeometryInfo(db, tableName, geometryColumn)
      : null;
  const geometryType = inferGeometryType(
    basemapAudit,
    geoDetection,
    geometryInfo?.geometryType
  );
  const columnAnalyses = await getColumnAnalyses(db, tableName);
  const suggestions = geometryType
    ? vizSuggester.suggestVisualizations(columnAnalyses, geometryType, {
        maxSuggestions: 12
      })
    : [];
  const issues = validateSuggestions(suggestions, geometryType);
  const notes: string[] = [];

  if (basemapAudit?.mode === 'catalog-gps') {
    notes.push(
      'Geometry inferred as Point from detected latitude/longitude columns.'
    );
  } else if (
    basemapAudit &&
    (basemapAudit.mode === 'catalog-text' ||
      basemapAudit.mode === 'catalog-text-fallback')
  ) {
    notes.push(
      'Geometry inferred as Polygon from joinable/default basemap path.'
    );
  } else if (basemapAudit?.mode === 'custom-geometry') {
    notes.push('Geometry inferred from imported geographic file.');
  } else if (!geometryType) {
    notes.push(
      'No reliable geometry inference available for visualization suggestions.'
    );
  }

  return {
    fixture: fixtureLabel,
    importKind,
    rowCount,
    geometryType,
    basemapMode: basemapAudit?.mode ?? 'unknown',
    columnCount: columnAnalyses.length,
    detectedGeoColumns: geoDetection.geoColumns.map((column) => ({
      columnName: column.columnName,
      type: column.type,
      confidence: Number(column.confidence.toFixed(3))
    })),
    defaultSuggestionId: suggestions[0]?.id,
    defaultSuggestionScore: suggestions[0]?.score,
    suggestions: snapshotSuggestions(suggestions),
    initialVisibleSuggestionIds: suggestions
      .slice(0, 3)
      .map((suggestion) => suggestion.id),
    notes,
    issues
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
  relativePath: string
): Promise<VizDatasetAuditEntry[]> {
  const absolutePath = join(ROOT, relativePath);
  const extension = extname(relativePath).toLowerCase();

  if (extension === '.csv') {
    return [
      await auditDatasetFixture({
        fixtureLabel: relativePath,
        absolutePath,
        importKind: 'csv',
        basemapAudit: basemapReport.primaryDatasets.find(
          (entry) => entry.fixture === relativePath
        )
      })
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
        const fixtureLabel = `${relativePath}::${shpEntry}`;
        return [
          await auditDatasetFixture({
            fixtureLabel,
            absolutePath: join(extracted.dir, shpEntry),
            importKind: 'zip-geo',
            basemapAudit: basemapReport.primaryDatasets.find(
              (entry) => entry.fixture === fixtureLabel
            )
          })
        ];
      }

      return await Promise.all(
        csvEntries.map((entry) => {
          const fixtureLabel = `${relativePath}::${entry}`;
          return auditDatasetFixture({
            fixtureLabel,
            absolutePath: join(extracted.dir, entry),
            importKind: 'zip-csv',
            basemapAudit: basemapReport.primaryDatasets.find(
              (dataset) => dataset.fixture === fixtureLabel
            )
          });
        })
      );
    } finally {
      rmSync(extracted.dir, { recursive: true, force: true });
    }
  }

  return [
    await auditDatasetFixture({
      fixtureLabel: relativePath,
      absolutePath,
      importKind: 'geo',
      basemapAudit: basemapReport.primaryDatasets.find(
        (entry) => entry.fixture === relativePath
      )
    })
  ];
}

function renderMarkdown(report: VizAuditReport): string {
  const lines = [
    '# Visualization Suggestions Audit',
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
    lines.push(`- importKind: ${dataset.importKind}`);
    lines.push(`- geometryType: ${dataset.geometryType ?? 'null'}`);
    lines.push(`- basemapMode: ${dataset.basemapMode}`);
    lines.push(`- default: ${dataset.defaultSuggestionId ?? 'none'}`);
    lines.push(
      `- firstVisible: ${dataset.initialVisibleSuggestionIds.join(', ') || 'none'}`
    );
    if (dataset.suggestions.length > 0) {
      lines.push(
        `- suggestions: ${dataset.suggestions
          .map((suggestion) => `${suggestion.id}:${suggestion.score}`)
          .join(', ')}`
      );
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

describe('temporary visualization suggestions audit', () => {
  beforeAll(async () => {
    if (
      !readdirSync(join(process.cwd(), 'tmp')).includes(
        'basemap-suggestions-audit-report.json'
      )
    ) {
      throw new Error(
        'Missing tmp/basemap-suggestions-audit-report.json. Run the basemap audit helper first.'
      );
    }

    basemapReport = JSON.parse(
      readFileSync(BASEMAP_REPORT_JSON_PATH, 'utf8')
    ) as BasemapAuditReport;
    db = await createTestInstance();
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('audits every tests-datasets fixture for visualization suggestions and writes a report', async () => {
    const allFiles = listFiles(ROOT).map(classifyFile);
    const primaryFiles = allFiles
      .filter((entry) => entry.category === 'primary')
      .map((entry) => entry.path);

    const datasetGroups: VizDatasetAuditEntry[][] = [];
    for (const relativePath of primaryFiles) {
      datasetGroups.push(await auditPrimaryFile(relativePath));
    }
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
