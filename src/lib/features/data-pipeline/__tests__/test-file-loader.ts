import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';

const TEST_DATASETS_ROOT = join(process.cwd(), 'tests-datasets');

export const TEST_PATHS = {
  CSV: join(TEST_DATASETS_ROOT, 'csv'),
  GEOJSON: join(TEST_DATASETS_ROOT, 'geojson'),
  GPKG: join(TEST_DATASETS_ROOT, 'gpkg'),
  GPX: join(TEST_DATASETS_ROOT, 'gpx'),
  KML: join(TEST_DATASETS_ROOT, 'kml-kmz'),
  SHP: join(TEST_DATASETS_ROOT, 'shp'),
  ZIP: join(TEST_DATASETS_ROOT, 'zip')
} as const;

export function loadTestFile(relativePath: string): File {
  const fullPath = join(TEST_DATASETS_ROOT, relativePath);
  const buffer = readFileSync(fullPath);
  const fileName = basename(fullPath);
  const mimeType = getMimeType(fileName);

  return new File([buffer], fileName, { type: mimeType });
}

export function loadTestFileFromPath(fullPath: string): File {
  const buffer = readFileSync(fullPath);
  const fileName = basename(fullPath);
  const mimeType = getMimeType(fileName);

  return new File([buffer], fileName, { type: mimeType });
}

export function listTestFiles(category: keyof typeof TEST_PATHS): string[] {
  const dirPath = TEST_PATHS[category];
  return readdirSync(dirPath)
    .filter((f) => !f.startsWith('.') && !f.endsWith('.webloc'))
    .map((f) => join(dirPath, f));
}

export function listCSVFiles(): string[] {
  return listTestFiles('CSV').filter((f) => f.endsWith('.csv'));
}

export function listGeoJSONFiles(): string[] {
  return listTestFiles('GEOJSON').filter((f) => f.endsWith('.geojson'));
}

export function listZIPFiles(): string[] {
  return listTestFiles('ZIP').filter((f) => f.endsWith('.zip'));
}

export function getShapefileBundle(shpDirName: string): string[] {
  const shpDir = join(TEST_PATHS.SHP, shpDirName);
  const files = readdirSync(shpDir);
  const shpExtensions = [
    '.shp',
    '.shx',
    '.dbf',
    '.prj',
    '.cpg',
    '.sbn',
    '.sbx'
  ];

  return files
    .filter((f) => shpExtensions.some((ext) => f.toLowerCase().endsWith(ext)))
    .map((f) => join(shpDir, f));
}

export function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.geojson': 'application/geo+json',
    '.gpkg': 'application/geopackage+sqlite3',
    '.gpx': 'application/gpx+xml',
    '.kml': 'application/vnd.google-earth.kml+xml',
    '.kmz': 'application/vnd.google-earth.kmz',
    '.shp': 'application/octet-stream',
    '.shx': 'application/octet-stream',
    '.dbf': 'application/octet-stream',
    '.prj': 'text/plain',
    '.cpg': 'text/plain',
    '.zip': 'application/zip',
    '.parquet': 'application/octet-stream',
    '.geoparquet': 'application/octet-stream'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

export function getFileStats(filePath: string): { size: number; name: string } {
  const stats = statSync(filePath);
  return {
    size: stats.size,
    name: basename(filePath)
  };
}

export const CSV_TEST_FILES = {
  VALID: {
    FOSSIL_FUEL: 'csv/fossil-fuel-subsidies-gdp-2021.csv',
    NAISSANCES: 'csv/naissances-par-commune-departement-et-region-2018.csv',
    SEVESO: 'csv/sites-seveso-idf.csv',
    WORLD_BANK: 'csv/world-bank-rural-pop.csv'
  },
  MALFORMED: {
    COLUMNS_100: 'csv/csv-malformed--with-100-columns.csv',
    DUPLICATED_NAMES: 'csv/csv-malformed--with-duplicated-column-name.csv',
    EMPTY_COLUMNS: 'csv/csv-malformed--with-empty-columns.csv',
    EMPTY_LINES: 'csv/csv-malformed--with-empty-lines.csv',
    EUROPEAN_FORMAT: 'csv/csv-malformed--with-european-numeric-format.csv',
    HEADER_ONLY: 'csv/csv-malformed--with-header-only.csv',
    NO_HEADER: 'csv/csv-malformed--with-no-header.csv',
    NOTHING: 'csv/csv-malformed--with-nothing.csv',
    NULL_VARIATIONS: 'csv/csv-malformed--with-null-variations.csv',
    NUMERIC_EDGE: 'csv/csv-malformed--with-numeric-all-edge-cases.csv',
    NUMERIC_MIXED: 'csv/csv-malformed--with-numeric-formats-mixed.csv',
    SPECIAL_CHARS: 'csv/csv-malformed--with-special-characters.csv'
  }
} as const;

export const GEOJSON_TEST_FILES = {
  STAR_LINES: 'geojson/lignes-du-reseau-star-de-rennes-metropole.geojson',
  NUTS2: 'geojson/nuts2_data.geojson'
} as const;

export const ZIP_TEST_FILES = {
  SINGLE_CSV: 'zip/single-csv.zip',
  MULTIPLE_CSV: 'zip/multiple-csv.zip',
  SHAPEFILE: 'zip/shapefile-complete.zip'
} as const;

export const SHP_TEST_BUNDLES = {
  NE_50M: 'ne_50m',
  STAR_LINES: 'lignes-du-reseau-star-de-rennes-metropole',
  MOS_FONCIER: 'mos_foncier_agrege_com',
  EEZ: 'Marines-regionsEEZ_land_union_v3_202003'
} as const;
