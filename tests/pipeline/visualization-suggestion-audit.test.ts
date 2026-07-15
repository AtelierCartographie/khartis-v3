import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';
import {
  DuckDBInstance,
  type DuckDBConnection,
  type DuckDBInstance as NodeDuckDBInstance
} from '@duckdb/node-api';
import { analyse as analyseMacros } from '$lib/features/duckdb/macros/analyse';
import { normalizeFormattedNumericColumns } from '$lib/features/data-pipeline/operations/tabular-numeric-normalization';
import { detectCsvHeader } from '$lib/features/data-pipeline/utils/csv-header-detector';
import {
  detectDecimalSeparator,
  readFileHead
} from '$lib/features/data-pipeline/utils/decimal-detector';
import type {
  ColumnAnalysis,
  DatasetResult
} from '$lib/features/data-pipeline/types';
import { fromDuckDBType } from '$lib/features/data-pipeline/types';
import {
  vizSuggester,
  type GeometryType,
  type VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';
import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';

const mocks = vi.hoisted(() => ({
  notifyChangeMock: vi.fn(),
  updateLegendItemMock: vi.fn(),
  datasets: [] as DatasetResult[],
  selectedDatasetId: undefined as string | undefined
}));

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {},
  duckDBOrchestrator: {
    initialize: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue(null)
  },
  validateGPSColumns: vi.fn().mockResolvedValue({ isValid: true }),
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326',
    WEB_MERCATOR_CRS: 'EPSG:3857'
  },
  DUCK_CONST: {
    DEFAULT: {
      DECIMAL_SEPARATOR: '.',
      FORMAT_TABULAR: 'csv',
      NULL_VALUES: "['']",
      SOURCE: 'user'
    },
    QUERY_FORMAT: {
      ARROW_TABLE: 'arrow-table',
      ARROW_IPC: 'arrow-ipc',
      ARRAY: 'array'
    },
    TYPE: {
      TABULAR: 'tabular',
      GEOFILE: 'geofile',
      PARQUET: 'parquet'
    },
    REGEX: {}
  },
  EXTENSIONS: { SPATIAL: 'spatial', HTTPFS: 'httpfs' },
  TABLE_PATTERNS: {
    JOIN_RESULTS_SUFFIX: '_join_results',
    FILTERED_SUFFIX: '_filtered',
    UNIFIED_BASEMAP_ATTRS: 'unified_basemap_attributes',
    CUSTOM_BASEMAP_ATTRS: 'custom_basemap_attributes'
  },
  SQL_FUNCTIONS: {
    ST_READ: 'ST_Read',
    ST_READ_META: 'ST_Read_Meta',
    ST_TRANSFORM: 'ST_Transform',
    ST_GEOM_FROM_WKB: 'ST_GeomFromWKB',
    ST_SIMPLIFY: 'ST_Simplify',
    ST_SIMPLIFY_PRESERVE_TOPOLOGY: 'ST_SimplifyPreserveTopology',
    NORMALIZE_TEXT: 'normalize_text',
    READ_CSV: 'read_csv',
    READ_CSV_AUTO: 'read_csv_auto',
    READ_PARQUET: 'read_parquet'
  },
  DuckDBSimplifiedType: {
    NUMERIC: 'numeric',
    BOOLEAN: 'boolean',
    DATE: 'date',
    STRING: 'string',
    GEOMETRY: 'geometry',
    OTHER: 'other'
  }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mocks.datasets;
    },
    get selectedDatasetId() {
      return mocks.selectedDatasetId;
    },
    get selectedDataset() {
      return (
        mocks.datasets.find(
          (dataset) => dataset.id === mocks.selectedDatasetId
        ) ?? null
      );
    }
  }
}));

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
  projectStore: {
    currentProject: undefined
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: vi.fn(() => null)
  }
}));

vi.mock('$lib/features/step-toolbar/tools/legend/legend.store.svelte', () => ({
  getLegendState: () => ({ items: [] }),
  legendActions: {
    updateLegendItem: mocks.updateLegendItemMock
  }
}));

import {
  PrimitiveFilterType,
  visualizationStore
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  applySuggestionToVisualization,
  isVisualizationMatchingSuggestion,
  resolveBlankVisualizationType,
  resolveDatasetGeometryType
} from '$lib/features/visualization-tab/services/suggestion.service';
import {
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyLineCategorical,
  shouldApplyLineChoropleth,
  shouldApplyProportionalSymbols
} from '$lib/features/map/utils/data-styling.utils';

type ImportedAuditDataset = {
  source: string;
  dataset: DatasetResult;
};

type DescribeRow = {
  name?: string;
  type?: string;
  type_simple?: string;
  column_name?: string;
  column_type?: string;
};

type GeometryQueryRow = {
  geom_type?: string | null;
  minx?: number | null;
  miny?: number | null;
  maxx?: number | null;
  maxy?: number | null;
};

type QueryDuck = {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
};

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const FULL_AUDIT = process.env.KHARTIS_FULL_SUGGESTION_AUDIT === '1';

const DEFAULT_AUDIT_SOURCES = [
  ...[
    'csv/csv-malformed--with-100-columns.csv',
    'csv/csv-malformed--with-duplicated-column-name.csv',
    'csv/csv-malformed--with-empty-columns.csv',
    'csv/csv-malformed--with-empty-lines.csv',
    'csv/csv-malformed--with-european-numeric-format.csv',
    'csv/csv-malformed--with-header-only.csv',
    'csv/csv-malformed--with-no-header.csv',
    'csv/csv-malformed--with-nothing.csv',
    'csv/csv-malformed--with-null-variations.csv',
    'csv/csv-malformed--with-numeric-all-edge-cases.csv',
    'csv/csv-malformed--with-numeric-formats-mixed.csv',
    'csv/csv-malformed--with-special-characters.csv',
    'csv/fossil-fuel-subsidies-gdp-2021.csv',
    'csv/france-regions-simplification-check.csv',
    'csv/fuzzy-countries.csv',
    'csv/naissances-par-commune-departement-et-region-2018.csv',
    'csv/sites-seveso-idf-custom-gps-columns.csv',
    'csv/sites-seveso-idf-invalid-gps.csv',
    'csv/sites-seveso-idf-swapped-gps.csv',
    'csv/sites-seveso-idf.csv',
    'csv/tabular-gps-gcpnt-columns.csv',
    'csv/test-csv-options-header.csv',
    'csv/test-csv-options-second-file.csv',
    'csv/test-csv-options-thousands.csv',
    'csv/tiny-geo-3features-enrich.csv',
    'csv/visualization-toolbox-cases.csv',
    'csv/world-bank-rural-pop.csv',
    'geojson/lignes-du-reseau-star-de-rennes-metropole.geojson',
    'geojson/multipoint-representative-points.geojson',
    'geojson/nuts2_data.geojson',
    'geojson/tiny-geo-3features.geojson',
    'geojson/visualization-toolbox-cases.geojson',
    'gpkg/compagnies-herault-l93.gpkg',
    'gpx/star_arrets_physiques_actifs/star_arrets_physiques_actifs.gpx',
    'kml-kmz/aires-covoiturage/aires-covoiturage.kml',
    'shp/lignes-du-reseau-star-de-rennes-metropole/lignes-du-reseau-star-de-rennes-metropole.shp',
    'shp/ne_50m/ne_50m_admin_0_countries_lakes.shp',
    'zip/multiple-csv.zip',
    'zip/shapefile-complete.zip',
    'zip/single-csv.zip'
  ].map((relativePath) =>
    join(REPO_ROOT, 'static/tests-datasets', relativePath)
  )
];

const DBF_HEADER_LENGTH_OFFSET = 8;
const DBF_FIELD_DESCRIPTOR_LENGTH = 32;
const DBF_FIELD_NAME_LENGTH = 11;
const DBF_HEADER_TERMINATOR = 0x0d;

const FULL_AUDIT_SOURCES = [
  ...DEFAULT_AUDIT_SOURCES,
  ...[
    'gpkg/ADE 4.0 GPKG GLP ED Dec 5 2025.gpkg',
    'gpkg/ADMIN-EXPRESS_4-0__GPKG_RGAF09UTM20_GLP_2025-12-05/ADE_4-0_GPKG_RGAF09UTM20_GLP-ED2025-12-05.gpkg',
    'shp/Marines-regionsEEZ_land_union_v3_202003/EEZ_Land_v3_202030.shp',
    'shp/mos_foncier_agrege_com/mos_foncier_agrege_com.shp'
  ].map((relativePath) =>
    join(REPO_ROOT, 'static/tests-datasets', relativePath)
  )
];

const LINE_CATEGORICAL_SUGGESTION_IDS = new Set([
  'lines_colorful_QL',
  'lines_colorful_QLO',
  'lines_proportional_colorful_QL'
]);

const LINE_CLASSED_SUGGESTION_IDS = new Set([
  'lines_colorful_QTR',
  'lines_proportional_colorful_QTR'
]);

const POLYGON_CATEGORICAL_SUGGESTION_IDS = new Set([
  'polygons_colorful_QL',
  'polygons_colorful_QLO'
]);

const POLYGON_CLASSED_SUGGESTION_IDS = new Set(['choropleth']);

const POINT_CATEGORICAL_SUGGESTION_IDS = new Set([
  'symbols_differents',
  'symbols_differents_QLO',
  'symbols_uniques_colorful_QL',
  'symbols_uniques_colorful_QLO',
  'symbols_proportional_colorful_QL'
]);

const POINT_CLASSED_SUGGESTION_IDS = new Set([
  'symbols_uniques_colorful_QTR',
  'symbols_proportional_colorful_QTR'
]);

const POINT_PROPORTIONAL_SUGGESTION_IDS = new Set([
  'symbols_proportional',
  'symbols_proportional_colorful_QL',
  'symbols_proportional_colorful_QTR',
  'symbols_proportional_double'
]);

const GEOMETRY_TYPES = new Set([
  '.csv',
  '.geojson',
  '.json',
  '.gpkg',
  '.gpx',
  '.kml',
  '.shp',
  '.zip'
]);

let dbInstance: NodeDuckDBInstance;
let dbConnection: DuckDBConnection;
let tempRoots: string[] = [];

function buildColumnAnalysis(dataset: DatasetResult): ColumnAnalysis[] {
  const geoColumnsByName = new Map(
    (dataset.geoDetection?.geoColumns ?? []).map((column) => [
      column.columnName,
      column
    ])
  );

  return dataset.columns.map((column) => {
    const geoColumn = geoColumnsByName.get(column.name);

    return {
      ...(geoColumn
        ? {
            geo_type: geoColumn.type,
            geo_confidence: geoColumn.confidence
          }
        : {}),
      name: column.name,
      type: column.type,
      stats: {
        count: column.stats?.count ?? 0,
        nulls: column.stats?.nulls ?? 0,
        uniques: column.stats?.uniques ?? 0,
        min: column.stats?.min,
        max: column.stats?.max,
        mean: column.stats?.mean,
        share_integers: column.stats?.share_integers,
        share_floats: column.stats?.share_floats,
        share_rank_interval: column.stats?.share_rank_interval,
        extent_magnitude: column.stats?.extent_magnitude
      }
    };
  });
}

function wrapDuckConnection(connection: DuckDBConnection): QueryDuck {
  return {
    async query(sql: string): Promise<unknown> {
      const reader = await connection.runAndReadAll(sql);
      return reader.getRowObjectsJson();
    }
  };
}

async function queryRows<T extends Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const reader = await dbConnection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as T[];
}

function buildDatasetId(source: string): string {
  return `audit-${basename(source).replace(/[^a-zA-Z0-9_]+/g, '-')}`;
}

function mapGeometryType(
  rawType: string | null | undefined
): GeometryType | null {
  if (!rawType) {
    return null;
  }

  const normalized = rawType.replace(/^ST_/i, '').toUpperCase();
  switch (normalized) {
    case 'POINT':
      return 'Point';
    case 'MULTIPOINT':
      return 'MultiPoint';
    case 'LINESTRING':
      return 'LineString';
    case 'MULTILINESTRING':
      return 'MultiLineString';
    case 'POLYGON':
      return 'Polygon';
    case 'MULTIPOLYGON':
      return 'MultiPolygon';
    default:
      return null;
  }
}

async function getGeometryInfo(
  tableName: string
): Promise<DatasetResult['geometry'] | undefined> {
  const escapedTable = escapeIdentifier(tableName);
  const describeRows = await queryRows<DescribeRow>(
    `DESCRIBE "${escapedTable}"`
  );
  const geometryColumn = describeRows.find((column) =>
    String(column.column_type ?? column.type ?? '')
      .toUpperCase()
      .startsWith('GEOMETRY')
  );

  const geometryColumnName =
    geometryColumn?.column_name ?? geometryColumn?.name;
  if (!geometryColumnName) {
    return undefined;
  }

  const escapedGeomCol = escapeIdentifier(geometryColumnName);
  const [typeRow] = await queryRows<GeometryQueryRow>(`
    SELECT ST_GeometryType("${escapedGeomCol}") AS geom_type
    FROM "${escapedTable}"
    WHERE "${escapedGeomCol}" IS NOT NULL
    LIMIT 1
  `);
  const [extentRow] = await queryRows<GeometryQueryRow>(`
    WITH agg AS (SELECT ST_Extent_Agg("${escapedGeomCol}") AS extent FROM "${escapedTable}")
    SELECT
      ST_XMin(extent) AS minX,
      ST_YMin(extent) AS minY,
      ST_XMax(extent) AS maxX,
      ST_YMax(extent) AS maxY
    FROM agg
  `);
  const geometryType = mapGeometryType(
    typeof typeRow?.geom_type === 'string' ? typeRow.geom_type : null
  );

  if (
    !geometryType ||
    extentRow?.minx == null ||
    extentRow?.miny == null ||
    extentRow?.maxx == null ||
    extentRow?.maxy == null
  ) {
    return geometryType
      ? {
          type: geometryType,
          bounds: [-180, -90, 180, 90],
          centroid: [0, 0],
          columnName: geometryColumnName
        }
      : undefined;
  }

  const bounds: [number, number, number, number] = [
    Number(extentRow.minx),
    Number(extentRow.miny),
    Number(extentRow.maxx),
    Number(extentRow.maxy)
  ];

  return {
    type: geometryType,
    columnName: geometryColumnName,
    bounds,
    centroid: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
  };
}

async function analyzeTable(
  tableName: string
): Promise<DatasetResult['columns']> {
  const escapedTableString = escapeSqlString(tableName);
  const describeRows = await queryRows<DescribeRow>(
    `FROM describe_full('${escapedTableString}')`
  );

  const columns = await Promise.all(
    describeRows.map(async (column) => {
      const columnName = String(column.name ?? '');
      const escapedColumnName = escapeIdentifier(columnName);

      const [general] = await queryRows<Record<string, unknown>>(
        `FROM summary_general('${escapedTableString}', "${escapedColumnName}")`
      );

      let specific: Record<string, unknown> = {};
      if (column.type_simple === 'numeric') {
        [specific = {}] = await queryRows<Record<string, unknown>>(
          `FROM summary_numeric('${escapedTableString}', "${escapedColumnName}")`
        );
      } else if (column.type_simple === 'date') {
        [specific = {}] = await queryRows<Record<string, unknown>>(
          `FROM summary_date('${escapedTableString}', "${escapedColumnName}")`
        );
      }

      const columnType = fromDuckDBType(
        String(column.type_simple ?? column.type ?? 'text')
      );

      return {
        name: columnName,
        values: [],
        type: columnType,
        stats: {
          name: columnName,
          type: columnType,
          count: Number(general?.count ?? 0),
          nulls: Number(general?.nulls ?? 0),
          uniques: Number(general?.uniques ?? 0),
          min: specific.min,
          max: specific.max,
          share_integers:
            specific.share_integers != null
              ? Number(specific.share_integers)
              : undefined,
          share_floats:
            specific.share_floats != null
              ? Number(specific.share_floats)
              : undefined,
          share_rank_interval:
            specific.share_rank_interval != null
              ? Number(specific.share_rank_interval)
              : undefined,
          extent_magnitude:
            specific.extent_magnitude != null
              ? Number(specific.extent_magnitude)
              : undefined
        }
      };
    })
  );

  return columns;
}

async function applyGeoDetection(
  dataset: DatasetResult
): Promise<DatasetResult['geoDetection']> {
  const candidateColumns = dataset.columns.map((column) => column.name);
  if (candidateColumns.length === 0) {
    return undefined;
  }

  const escapedTable = escapeIdentifier(dataset.tableName);
  const escapedColumns = candidateColumns
    .map((column) => `"${escapeIdentifier(column)}"`)
    .join(', ');

  const rows = await queryRows<Record<string, unknown>>(
    `SELECT ${escapedColumns} FROM "${escapedTable}" LIMIT 200`
  );

  if (rows.length === 0) {
    return undefined;
  }

  const matrix = rows.map((row) =>
    candidateColumns.map((column) => row[column] ?? null)
  );

  return GeoColumnDetector.detectGeoColumns(candidateColumns, matrix, {
    sampleSize: Math.min(200, matrix.length)
  });
}

function buildDatasetResult(params: {
  source: string;
  tableName: string;
  columns: DatasetResult['columns'];
  rowCount: number;
  geometry?: DatasetResult['geometry'];
  geoDetection?: DatasetResult['geoDetection'];
}): DatasetResult {
  const { source, tableName, columns, rowCount, geometry, geoDetection } =
    params;
  return {
    id: buildDatasetId(source),
    name: basename(source),
    sourceFileId: source,
    tableName,
    columns,
    rowCount,
    geometry,
    geoDetection,
    metadata: {
      processedAt: new Date('2026-01-01T00:00:00.000Z'),
      fileType: extname(source).slice(1) || 'unknown',
      parserUsed: 'DuckDB Node Audit',
      transformations: []
    },
    analysis: {
      columns,
      hasGeoData: Boolean(geometry || geoDetection?.hasGeoColumns),
      geoColumns:
        geoDetection?.geoColumns ??
        (geometry
          ? [
              {
                index: 0,
                columnName: geometry.columnName ?? 'geom',
                type: 'unknown',
                confidence: 1,
                isValid: true
              }
            ]
          : []),
      rowCount,
      warnings: [...(geoDetection?.warnings ?? [])]
    },
    format: extname(source).slice(1) as DatasetResult['format'],
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  };
}

async function importGeoDataset(source: string): Promise<ImportedAuditDataset> {
  const preparedSource = await prepareGeoDatasetSource(source);
  const tableName = `audit_${buildDatasetId(source).replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const escapedTable = escapeIdentifier(tableName);
  const escapedSource = escapeSqlString(preparedSource);

  await dbConnection.run(`DROP TABLE IF EXISTS "${escapedTable}"`);
  await dbConnection.run(
    `CREATE OR REPLACE TABLE "${escapedTable}" AS FROM ST_Read('${escapedSource}')`
  );

  const columns = await analyzeTable(tableName);
  const geometry = await getGeometryInfo(tableName);
  const [{ cnt }] = await queryRows<{ cnt: number | string }>(
    `SELECT COUNT(*) AS cnt FROM "${escapedTable}"`
  );

  return {
    source,
    dataset: buildDatasetResult({
      source,
      tableName,
      columns,
      rowCount: Number(cnt ?? 0),
      geometry
    })
  };
}

function decodeDbfFieldName(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end -= 1;
  }

  return String.fromCharCode(...bytes.slice(0, end));
}

function encodeDbfFieldName(name: string): Uint8Array {
  const encoded = new Uint8Array(DBF_FIELD_NAME_LENGTH);

  for (
    let index = 0;
    index < name.length && index < DBF_FIELD_NAME_LENGTH;
    index += 1
  ) {
    encoded[index] = name.charCodeAt(index) & 0xff;
  }

  return encoded;
}

function normalizeDbfFieldKey(name: string): string {
  return name.trim().toLowerCase();
}

function createUniqueDbfFieldName(name: string, usedKeys: Set<string>): string {
  const trimmed = name.trim() || 'field';
  let attempt = 2;

  while (true) {
    const suffix = `_${attempt}`;
    const maxBaseLength = DBF_FIELD_NAME_LENGTH - suffix.length;
    const candidate = `${trimmed.slice(0, Math.max(1, maxBaseLength))}${suffix}`;
    const key = normalizeDbfFieldKey(candidate);

    if (!usedKeys.has(key)) {
      return candidate;
    }

    attempt += 1;
  }
}

async function prepareGeoDatasetSource(source: string): Promise<string> {
  if (extname(source).toLowerCase() !== '.shp') {
    return source;
  }

  const dbfPath = join(dirname(source), `${basename(source, '.shp')}.dbf`);
  let dbfBytes: Uint8Array;

  try {
    dbfBytes = new Uint8Array(await readFile(dbfPath));
  } catch {
    return source;
  }

  const headerLength =
    dbfBytes[DBF_HEADER_LENGTH_OFFSET] |
    (dbfBytes[DBF_HEADER_LENGTH_OFFSET + 1] << 8);

  if (
    !Number.isFinite(headerLength) ||
    headerLength <= DBF_FIELD_DESCRIPTOR_LENGTH ||
    headerLength > dbfBytes.length
  ) {
    return source;
  }

  const fieldOffsets: Array<{ offset: number; name: string }> = [];
  for (
    let offset = DBF_FIELD_DESCRIPTOR_LENGTH;
    offset + DBF_FIELD_DESCRIPTOR_LENGTH <= headerLength;
    offset += DBF_FIELD_DESCRIPTOR_LENGTH
  ) {
    if (dbfBytes[offset] === DBF_HEADER_TERMINATOR) {
      break;
    }

    fieldOffsets.push({
      offset,
      name: decodeDbfFieldName(
        dbfBytes.slice(offset, offset + DBF_FIELD_NAME_LENGTH)
      )
    });
  }

  const usedKeys = new Set<string>();
  let renamedCount = 0;

  for (const field of fieldOffsets) {
    const currentKey = normalizeDbfFieldKey(field.name);
    if (!usedKeys.has(currentKey)) {
      usedKeys.add(currentKey);
      continue;
    }

    const replacement = createUniqueDbfFieldName(field.name, usedKeys);
    usedKeys.add(normalizeDbfFieldKey(replacement));
    dbfBytes.set(encodeDbfFieldName(replacement), field.offset);
    renamedCount += 1;
  }

  if (renamedCount === 0) {
    return source;
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'khartis-suggestions-shp-'));
  tempRoots.push(tempRoot);
  const sourceDir = dirname(source);
  const sourceBaseName = basename(source, extname(source)).toLowerCase();
  const directoryEntries = await readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    directoryEntries.map(async (entry) => {
      if (entry.isDirectory()) {
        return;
      }

      const entryPath = join(sourceDir, entry.name);
      if (
        basename(entry.name, extname(entry.name)).toLowerCase() !==
        sourceBaseName
      ) {
        return;
      }

      const targetPath = join(tempRoot, entry.name);
      const content =
        extname(entry.name).toLowerCase() === '.dbf'
          ? dbfBytes
          : await readFile(entryPath);
      await writeFile(targetPath, content);
    })
  );

  return join(tempRoot, basename(source));
}

async function importCsvDataset(source: string): Promise<ImportedAuditDataset> {
  const fileBuffer = await readFile(source);
  const file = new File([fileBuffer], basename(source), { type: 'text/csv' });
  const cachedHead = await readFileHead(file, 20);
  const detection = await detectDecimalSeparator(file, { cachedHead });
  const headerDetection = await detectCsvHeader(file, detection.delimiter, {
    cachedHead
  });

  const tableName = `audit_${buildDatasetId(source).replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const escapedTable = escapeIdentifier(tableName);
  const escapedSource = escapeSqlString(source);

  await dbConnection.run(`DROP TABLE IF EXISTS "${escapedTable}"`);

  const buildCsvOptions = (
    retryOptions: {
      ignoreErrors?: boolean;
      allVarchar?: boolean;
      strictMode?: boolean;
      nullPadding?: boolean;
    } = {}
  ): string[] => {
    const options = [
      `header=${headerDetection.hasHeader}`,
      `decimal_separator='${detection.separator}'`,
      'normalize_names=true',
      "nullstr=['']",
      `delim='${detection.delimiter === "'" ? "''" : detection.delimiter}'`
    ];

    if (detection.thousandsSeparator) {
      options.push(`thousands='${detection.thousandsSeparator}'`);
    }

    if (retryOptions.ignoreErrors) {
      options.push('ignore_errors=true');
    }

    if (retryOptions.allVarchar) {
      options.push('all_varchar=true');
    }

    if (retryOptions.strictMode === false) {
      options.push('strict_mode=false');
    }

    if (retryOptions.nullPadding) {
      options.push('null_padding=true');
    }

    return options;
  };

  const runCsvImport = async (
    retryOptions: Parameters<typeof buildCsvOptions>[0] = {}
  ): Promise<number> => {
    await dbConnection.run(
      `CREATE OR REPLACE TABLE "${escapedTable}" AS FROM read_csv('${escapedSource}', ${buildCsvOptions(retryOptions).join(', ')})`
    );

    const [{ cnt }] = await queryRows<{ cnt: number | string }>(
      `SELECT COUNT(*) AS cnt FROM "${escapedTable}"`
    );

    return Number(cnt ?? 0);
  };

  let rowCount: number;
  try {
    rowCount = await runCsvImport();
    if (rowCount === 0) {
      rowCount = await runCsvImport({
        ignoreErrors: true,
        allVarchar: true,
        strictMode: false,
        nullPadding: true
      });
    }
  } catch {
    rowCount = await runCsvImport({
      ignoreErrors: true,
      allVarchar: true,
      strictMode: false,
      nullPadding: true
    });
  }

  await normalizeFormattedNumericColumns(
    tableName,
    wrapDuckConnection(dbConnection)
  );

  const columns = await analyzeTable(tableName);
  const geoDetection = await applyGeoDetection(
    buildDatasetResult({
      source,
      tableName,
      columns,
      rowCount
    })
  );
  return {
    source,
    dataset: buildDatasetResult({
      source,
      tableName,
      columns,
      rowCount,
      geoDetection
    })
  };
}

async function collectImportableFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectImportableFiles(absolutePath)));
      continue;
    }

    const extension = extname(entry.name).toLowerCase();
    if (!GEOMETRY_TYPES.has(extension)) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

async function extractArchive(source: string): Promise<string[]> {
  const archiveBuffer = await readFile(source);
  const extracted = unzipSync(new Uint8Array(archiveBuffer));
  const tempRoot = await mkdtemp(join(tmpdir(), 'khartis-suggestions-'));
  tempRoots.push(tempRoot);

  await Promise.all(
    Object.entries(extracted).map(async ([relativePath, content]) => {
      const targetPath = join(tempRoot, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content);
    })
  );

  const importableFiles = await collectImportableFiles(tempRoot);
  return importableFiles.filter(
    (file) => extname(file).toLowerCase() !== '.zip'
  );
}

async function importAuditSource(
  source: string
): Promise<ImportedAuditDataset[]> {
  const extension = extname(source).toLowerCase();

  if (extension === '.zip') {
    const extractedFiles = await extractArchive(source);
    const imported = await Promise.all(
      extractedFiles.map(async (file) => {
        const datasets = await importAuditSource(file);
        return datasets.map((entry) => ({
          ...entry,
          source: `${source} -> ${entry.source.replace(/.*khartis-suggestions-[^/]+\//, '')}`
        }));
      })
    );

    return imported.flat();
  }

  if (extension === '.csv' || extension === '.tsv' || extension === '.txt') {
    return [await importCsvDataset(source)];
  }

  return [await importGeoDataset(source)];
}

function getSuggestions(dataset: DatasetResult): VizSuggestion[] {
  const geometryType =
    resolveDatasetGeometryType(dataset) ||
    (dataset.geometry?.type as GeometryType | undefined) ||
    null;

  return vizSuggester.suggestVisualizations(
    buildColumnAnalysis(dataset),
    geometryType,
    { maxSuggestions: 10 }
  );
}

function assertRenderInvariant(
  dataset: DatasetResult,
  suggestion: VizSuggestion
): void {
  mocks.datasets = [dataset];
  mocks.selectedDatasetId = dataset.id;

  const visualization = visualizationStore.createVisualization(
    resolveBlankVisualizationType(dataset),
    dataset.id
  );

  applySuggestionToVisualization(visualization.id, suggestion);

  const updatedVisualization = visualizationStore.visualizations.find(
    (item) => item.id === visualization.id
  );

  expect(updatedVisualization).toBeDefined();
  expect(
    isVisualizationMatchingSuggestion(
      updatedVisualization!,
      dataset,
      suggestion
    )
  ).toBe(true);

  if (LINE_CATEGORICAL_SUGGESTION_IDS.has(suggestion.id)) {
    expect(shouldApplyLineCategorical(updatedVisualization!)).toBe(true);
  }

  if (LINE_CLASSED_SUGGESTION_IDS.has(suggestion.id)) {
    expect(shouldApplyLineChoropleth(updatedVisualization!)).toBe(true);
  }

  if (POLYGON_CATEGORICAL_SUGGESTION_IDS.has(suggestion.id)) {
    expect(shouldApplyCategorical(updatedVisualization!)).toBe(true);
  }

  if (POLYGON_CLASSED_SUGGESTION_IDS.has(suggestion.id)) {
    expect(shouldApplyChoropleth(updatedVisualization!)).toBe(true);
  }

  if (POINT_CATEGORICAL_SUGGESTION_IDS.has(suggestion.id)) {
    expect(
      shouldApplyCategorical(updatedVisualization!, PrimitiveFilterType.POINT)
    ).toBe(true);
  }

  if (POINT_CLASSED_SUGGESTION_IDS.has(suggestion.id)) {
    expect(
      shouldApplyChoropleth(updatedVisualization!, PrimitiveFilterType.POINT)
    ).toBe(true);
  }

  if (POINT_PROPORTIONAL_SUGGESTION_IDS.has(suggestion.id)) {
    expect(shouldApplyProportionalSymbols(updatedVisualization!)).toBe(true);
  }

  visualizationStore.clear();
}

function assertSuggestionColumnsAreSafe(
  dataset: DatasetResult,
  suggestions: VizSuggestion[]
): void {
  const geometryColumns = new Set(
    dataset.columns
      .filter((column) => column.type === 'geometry')
      .map((column) => column.name)
  );
  const detectedCoordinateColumns = new Set(
    (dataset.geoDetection?.geoColumns ?? [])
      .filter(
        (column) => column.type === 'latitude' || column.type === 'longitude'
      )
      .map((column) => column.columnName)
  );

  for (const suggestion of suggestions) {
    for (const columnName of suggestion.columns ?? []) {
      expect(dataset.columns.some((column) => column.name === columnName)).toBe(
        true
      );
      expect(geometryColumns.has(columnName)).toBe(false);
      expect(detectedCoordinateColumns.has(columnName)).toBe(false);
    }
  }
}

function buildAuditCases(): string[] {
  return FULL_AUDIT ? FULL_AUDIT_SOURCES : DEFAULT_AUDIT_SOURCES;
}

beforeAll(async () => {
  dbInstance = await DuckDBInstance.create(':memory:', {
    threads: '2',
    autoinstall_known_extensions: 'true',
    autoload_known_extensions: 'true'
  });
  dbConnection = await dbInstance.connect();
  await dbConnection.run('INSTALL spatial');
  await dbConnection.run('LOAD spatial');
  await dbConnection.run(analyseMacros);
});

afterAll(async () => {
  await Promise.all(
    tempRoots.map((path) => rm(path, { recursive: true, force: true }))
  );
  tempRoots = [];
  dbConnection.closeSync();
  dbInstance.closeSync();
});

beforeEach(() => {
  vi.clearAllMocks();
  visualizationStore.clear();
  mocks.datasets = [];
  mocks.selectedDatasetId = undefined;
});

describe('visualization suggestions audit', () => {
  const sources = buildAuditCases();

  it('keeps a colored line suggestion operational for the Rennes network dataset', async () => {
    const [entry] = await importAuditSource(
      resolve(
        REPO_ROOT,
        'static/tests-datasets/geojson/lignes-du-reseau-star-de-rennes-metropole.geojson'
      )
    );

    const suggestions = getSuggestions(entry.dataset);
    const suggestionIds = suggestions.map((suggestion) => suggestion.id);
    const coloredLineSuggestion = suggestions.find((suggestion) =>
      LINE_CATEGORICAL_SUGGESTION_IDS.has(suggestion.id)
    );

    expect(suggestionIds).toContain('lines_colorful_QL');
    assertRenderInvariant(entry.dataset, coloredLineSuggestion!);
  });

  for (const source of sources) {
    const label = source.replace(`${REPO_ROOT}/`, '');

    it(`audits ${label}`, async () => {
      const importedDatasets = await importAuditSource(source);
      expect(importedDatasets.length).toBeGreaterThan(0);

      for (const entry of importedDatasets) {
        const { dataset } = entry;
        const geometryType = resolveDatasetGeometryType(dataset);
        const suggestions = getSuggestions(dataset);

        mocks.datasets = [dataset];
        mocks.selectedDatasetId = dataset.id;

        expect(
          new Set(
            suggestions.map(
              (suggestion) =>
                suggestion.id + '::' + (suggestion.columns ?? []).join('|')
            )
          ).size
        ).toBe(suggestions.length);
        assertSuggestionColumnsAreSafe(dataset, suggestions);

        if (geometryType) {
          expect(suggestions.length).toBeGreaterThan(0);
        }

        for (const suggestion of suggestions) {
          assertRenderInvariant(dataset, suggestion);
        }

        if (dataset.name === 'sites-seveso-idf.csv') {
          expect(geometryType).toBe('Point');
        }

        if (dataset.name === 'sites-seveso-idf-swapped-gps.csv') {
          expect(geometryType).toBe('Point');
        }

        if (dataset.name === 'sites-seveso-idf-invalid-gps.csv') {
          expect(geometryType).toBeNull();
        }
      }
    });
  }
});
