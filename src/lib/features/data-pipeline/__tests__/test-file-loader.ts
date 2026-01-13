import { readFileSync, readdirSync } from 'fs';
import { basename, extname, join } from 'path';

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

export function listTestFiles(category: keyof typeof TEST_PATHS): string[] {
  const dirPath = TEST_PATHS[category];
  return readdirSync(dirPath)
    .filter((f) => !f.startsWith('.') && !f.endsWith('.webloc'))
    .map((f) => join(dirPath, f));
}

export function listGeoJSONFiles(): string[] {
  return listTestFiles('GEOJSON').filter((f) => f.endsWith('.geojson'));
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

export const GPKG_TEST_FILES = {
  COMPAGNIES_HERAULT: 'gpkg/compagnies-herault-l93.gpkg',
  ADMIN_EXPRESS_GLP:
    'gpkg/ADMIN-EXPRESS_4-0__GPKG_RGAF09UTM20_GLP_2025-12-05/ADE_4-0_GPKG_RGAF09UTM20_GLP-ED2025-12-05.gpkg'
} as const;

export const GPX_TEST_FILES = {
  STAR_ARRETS:
    'gpx/star_arrets_physiques_actifs/star_arrets_physiques_actifs.gpx'
} as const;

export const KML_TEST_FILES = {
  AIRES_COVOITURAGE: 'kml-kmz/aires-covoiturage/aires-covoiturage.kml'
} as const;
