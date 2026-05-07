import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';
const GEOMETRY_BASE_PATH = '/basemaps/geometry';

const ESSENTIAL_BASEMAP_IDS: readonly string[] = [
  'monde-countries-2024-low',
  'europe-nuts2-2024-low',
  'france-region-2025-high'
];

const ESSENTIAL_BUDGET_BYTES = 7 * 1024 * 1024;

export interface BasemapMetadataLayer {
  file: string;
  type: string;
  style: string | null;
  title_fr?: string;
  title_en?: string;
}

export interface BasemapMetadata {
  file: string;
  title_fr: string;
  subtitle_fr?: string;
  title_en: string;
  subtitle_en?: string;
  source?: string;
  date?: string;
  bbox?: number[];
  proj_source?: string;
  proj_to?: unknown;
  simplification_level?: string;
  layers?: BasemapMetadataLayer[];
}

export interface BasemapDownloadEntry {
  basemapId: string;
  title: string;
  files: string[];
  urls: string[];
  approxBytes?: number;
}

export type BasemapRegion = 'france' | 'europe' | 'monde' | 'autre';

let cachedMetadata: BasemapMetadata[] | null = null;

export async function loadBasemapMetadata(
  fetchImpl: typeof fetch = fetch
): Promise<BasemapMetadata[]> {
  if (cachedMetadata) return cachedMetadata;

  const url = resolveStaticAssetUrl(BASEMAP_METADATA_PATH);
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as BasemapMetadata[];
    cachedMetadata = data;
    return data;
  } catch (error) {
    logger.warn('Failed to load basemap metadata', LogCategory.SYSTEM, error);
    return [];
  }
}

export function clearBasemapMetadataCache(): void {
  cachedMetadata = null;
}

function geometryUrl(filename: string): string {
  return resolveStaticAssetUrl(`${GEOMETRY_BASE_PATH}/${filename}.parquet`);
}

function buildEntryFromMetadata(
  metadata: BasemapMetadata
): BasemapDownloadEntry {
  const files = [metadata.file];
  for (const layer of metadata.layers ?? []) {
    if (!files.includes(layer.file)) {
      files.push(layer.file);
    }
  }
  const urls = files.map((f) => geometryUrl(f));
  return {
    basemapId: metadata.file,
    title: metadata.title_fr ?? metadata.title_en ?? metadata.file,
    files,
    urls
  };
}

export async function buildEssentialDownloadEntries(
  fetchImpl?: typeof fetch
): Promise<BasemapDownloadEntry[]> {
  const metadata = await loadBasemapMetadata(fetchImpl);
  const byId = new Map(metadata.map((m) => [m.file, m]));

  const entries: BasemapDownloadEntry[] = [];
  for (const id of ESSENTIAL_BASEMAP_IDS) {
    const found = byId.get(id);
    if (!found) {
      logger.warn(
        'Essential basemap missing from metadata',
        LogCategory.SYSTEM,
        { id }
      );
      continue;
    }
    entries.push(buildEntryFromMetadata(found));
  }

  return entries;
}

export async function buildExtendedDownloadEntries(
  fetchImpl?: typeof fetch
): Promise<BasemapDownloadEntry[]> {
  const metadata = await loadBasemapMetadata(fetchImpl);
  return metadata.map((m) => buildEntryFromMetadata(m));
}

export function classifyBasemapRegion(basemapId: string): BasemapRegion {
  if (basemapId.startsWith('france-')) return 'france';
  if (basemapId.startsWith('europe-')) return 'europe';
  if (basemapId.startsWith('monde-')) return 'monde';
  return 'autre';
}

export function getEssentialBasemapIds(): readonly string[] {
  return ESSENTIAL_BASEMAP_IDS;
}

export function getEssentialBudgetBytes(): number {
  return ESSENTIAL_BUDGET_BYTES;
}
