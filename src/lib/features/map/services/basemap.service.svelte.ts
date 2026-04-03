import { Duck } from '$lib/features/duckdb';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { type Table as ArrowTable } from 'apache-arrow/Arrow';
// SvelteMap removed — basemap cache is non-reactive data processing
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import {
  escapeIdentifier,
  escapeSqlString
} from '../../commons/utils/sanitize.utils';
import { projectionStore } from '../stores/projection.store.svelte';
import type {
  BasemapMetadata,
  ProjectionPresets,
  StylePresets
} from '../types/basemap.types';
import { readGeoParquetDirect } from '../utils/read-geojson-arrow';
import { SimplificationLevel } from '../../commons/types/enums';
import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry
} from '../../duckdb/orchestrator/arrow-ops';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';
const BASEMAP_ATTRIBUTES_PATH = '/basemaps/all-basemaps-attributes.parquet';
const WORLD_COUNTRIES_EXAMPLE_PATH = '/examples/data/world-countries.geojson';
const PROJECTION_PRESETS_PATH = '/basemaps/projection-presets.json';
const STYLE_PRESETS_PATH = '/basemaps/style-presets.json';
const GEOMETRY_BASE_PATH = '/basemaps/geometry';
const DEFAULT_BASEMAP_ID = 'monde-countries-2024-medium';
const WORLD_COUNTRY_BASEMAP_IDS = [
  'monde-countries-2024-high',
  'monde-countries-2024-medium',
  'monde-countries-2024-low'
] as const;

interface WorldCountriesGeoJSON {
  features?: Array<{
    id?: string;
    properties?: {
      name?: string;
    };
  }>;
}

interface WorldCountryNameIdPair {
  id: string;
  normalized: string;
  raw: string;
}

function normalizeWorldCountryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function extractWorldCountryNameIdPairs(
  geoJSON: WorldCountriesGeoJSON
): WorldCountryNameIdPair[] {
  return (geoJSON.features ?? []).flatMap((feature) => {
    if (
      typeof feature.id !== 'string' ||
      typeof feature.properties?.name !== 'string'
    ) {
      return [];
    }

    const raw = feature.properties.name.trim();
    const id = feature.id.trim();
    if (!raw || !id) {
      return [];
    }

    return [
      {
        id,
        normalized: normalizeWorldCountryName(raw),
        raw
      }
    ];
  });
}

function getGeometryParquetUrl(filename: string): string {
  return resolveStaticAssetUrl(`${GEOMETRY_BASE_PATH}/${filename}.parquet`);
}

function isSimplificationLevel(
  value: string | null | undefined
): value is SimplificationLevel {
  return (
    value === SimplificationLevel.Low ||
    value === SimplificationLevel.Medium ||
    value === SimplificationLevel.High
  );
}

function getBasemapSimplificationLevel(
  metadata: BasemapMetadata
): SimplificationLevel | null {
  return isSimplificationLevel(metadata.simplification_level)
    ? metadata.simplification_level
    : null;
}

export function resolveBasemapVariantFile(
  file: string,
  currentLevel: string | undefined,
  nextLevel: SimplificationLevel
): string | null {
  if (!isSimplificationLevel(currentLevel)) {
    return null;
  }

  return file.replace(new RegExp(`-${currentLevel}$`), `-${nextLevel}`);
}

export interface LoadedBasemapVariantData {
  metadata: BasemapMetadata;
  geometryTable: ArrowTable;
  layerTables: Map<string, ArrowTable>;
}

interface LoadedBasemapVariantState extends LoadedBasemapVariantData {
  failedLayerFiles: Set<string>;
  loadingLayerTables: Map<string, Promise<ArrowTable | null>>;
}

interface LoadedBasemapVariantContainer extends LoadedBasemapVariantData {
  simplifiedVariants?: Map<SimplificationLevel, LoadedBasemapVariantData>;
  activeSimplificationLevel?: SimplificationLevel | null;
}

interface LoadedBasemap extends LoadedBasemapVariantState {
  simplifiedVariants?: Map<SimplificationLevel, LoadedBasemapVariantState>;
  activeSimplificationLevel?: SimplificationLevel | null;
}

export function getResolvedBasemapVariant(
  loadedBasemap: LoadedBasemapVariantContainer | null,
  level?: SimplificationLevel
): LoadedBasemapVariantData | null {
  if (!loadedBasemap) {
    return null;
  }

  const targetLevel = level ?? loadedBasemap.activeSimplificationLevel;
  const baseLevel = getBasemapSimplificationLevel(loadedBasemap.metadata);

  if (!targetLevel || targetLevel === baseLevel) {
    return loadedBasemap;
  }

  return loadedBasemap.simplifiedVariants?.get(targetLevel) ?? loadedBasemap;
}

function getResolvedBasemapVariantState(
  loadedBasemap: LoadedBasemap | null,
  level?: SimplificationLevel
): LoadedBasemapVariantState | null {
  if (!loadedBasemap) {
    return null;
  }

  const targetLevel = level ?? loadedBasemap.activeSimplificationLevel;
  const baseLevel = getBasemapSimplificationLevel(loadedBasemap.metadata);

  if (!targetLevel || targetLevel === baseLevel) {
    return loadedBasemap;
  }

  return loadedBasemap.simplifiedVariants?.get(targetLevel) ?? loadedBasemap;
}

function findBasemapMetadataByFile(
  basemaps: BasemapMetadata[],
  file: string
): BasemapMetadata | null {
  return basemaps.find((basemap) => basemap.file === file) ?? null;
}

function createLoadedBasemapVariant(
  metadata: BasemapMetadata,
  geometryTable: ArrowTable,
  layerTables: Map<string, ArrowTable>
): LoadedBasemapVariantState {
  return {
    metadata,
    geometryTable,
    layerTables,
    failedLayerFiles: new Set(),
    loadingLayerTables: new Map()
  };
}

function createBasemapService() {
  let availableBasemaps: BasemapMetadata[] = [];
  let isInitialized = false;
  let initializePromise: Promise<void> | null = null;
  let currentBasemap: LoadedBasemap | null = null;
  let attributesLoaded = false;
  let projectionPresetsData: ProjectionPresets | null = null;
  let stylePresetsData: StylePresets | null = null;
  const basemapCache = new Map<string, LoadedBasemap>();
  const geometryTablesInDuckDB = new Set<string>();
  const loadingBasemaps = new Map<string, Promise<LoadedBasemap | null>>();

  async function loadMetadata(): Promise<void> {
    try {
      logger.debug('Loading basemap metadata catalog', LogCategory.MAP);
      const response = await fetch(
        resolveStaticAssetUrl(BASEMAP_METADATA_PATH)
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      availableBasemaps = await response.json();
      logger.debug('Basemap metadata loaded', LogCategory.MAP, {
        count: availableBasemaps.length
      });
    } catch (error) {
      logger.error('Failed to load basemap metadata', LogCategory.MAP, error);
      throw error;
    }
  }

  async function repairWorldCountryAttributeIds(): Promise<void> {
    if (!Duck) {
      return;
    }

    const response = await fetch(
      resolveStaticAssetUrl(WORLD_COUNTRIES_EXAMPLE_PATH)
    );
    if (!response.ok) {
      logger.warn(
        'Failed to fetch world country repair source',
        LogCategory.MAP,
        { status: response.status, statusText: response.statusText }
      );
      return;
    }

    const pairs = extractWorldCountryNameIdPairs(
      (await response.json()) as WorldCountriesGeoJSON
    );
    if (pairs.length === 0) {
      logger.warn('World country repair source is empty', LogCategory.MAP);
      return;
    }

    const tempTableName = `world_country_repairs_${crypto.randomUUID().replace(/-/g, '_')}`;
    const escapedTempTableName = escapeIdentifier(tempTableName);
    const valuesSql = pairs
      .map(
        ({ raw, id, normalized }) =>
          `('${escapeSqlString(raw)}', '${escapeSqlString(id)}', '${escapeSqlString(normalized)}')`
      )
      .join(', ');
    const basemapIdsSql = WORLD_COUNTRY_BASEMAP_IDS.map(
      (basemapId) => `'${escapeSqlString(basemapId)}'`
    ).join(', ');

    await Duck.query(`
      CREATE TEMP TABLE "${escapedTempTableName}" (
        raw VARCHAR,
        id VARCHAR,
        normalized VARCHAR
      )
    `);
    await Duck.query(`
      INSERT INTO "${escapedTempTableName}" (raw, id, normalized)
      VALUES ${valuesSql}
    `);
    await Duck.query(`
      UPDATE basemap_attributes AS ba
      SET id = repairs.id
      FROM "${escapedTempTableName}" AS repairs
      WHERE ba.basemap IN (${basemapIdsSql})
        AND ba.normalized = repairs.normalized
        AND ba.id != repairs.id
    `);
    await Duck.query(`DROP TABLE "${escapedTempTableName}"`);
  }

  async function loadAttributesIntoDuckDB(): Promise<void> {
    if (!Duck || attributesLoaded) return;

    try {
      const response = await fetch(
        resolveStaticAssetUrl(BASEMAP_ATTRIBUTES_PATH)
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch attributes: ${response.statusText}`);
      }

      logger.debug('Loading basemap attributes into DuckDB', LogCategory.MAP);
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const attributesFile = new File(
        [blob],
        'all-basemaps-attributes.parquet',
        {
          type: 'application/octet-stream'
        }
      );

      await Duck.register_files([attributesFile]);

      const fileId =
        (attributesFile as File & { id?: string }).id ||
        `${attributesFile.lastModified}-${attributesFile.name}`;

      const escapedFileId = escapeSqlString(fileId);

      const result = await Duck.query(`
        CREATE OR REPLACE TABLE basemap_attributes AS
        SELECT * FROM parquet_scan('${escapedFileId}',
          hive_partitioning=false,
          union_by_name=false,
          filename=false
        )
      `);

      if (!result) {
        throw new Error('Failed to create basemap_attributes table');
      }

      await Duck.query(
        `UPDATE basemap_attributes SET id = raw WHERE variant = id`
      );
      await repairWorldCountryAttributeIds();

      attributesLoaded = true;
    } catch (error) {
      logger.error('Failed to load basemap attributes', LogCategory.MAP, error);
      throw error;
    }
  }

  async function loadProjectionPresets(): Promise<void> {
    try {
      const response = await fetch(
        resolveStaticAssetUrl(PROJECTION_PRESETS_PATH)
      );
      if (!response.ok) {
        logger.warn('Failed to fetch projection presets', LogCategory.MAP);
        return;
      }
      projectionPresetsData = await response.json();
      logger.debug('Projection presets loaded', LogCategory.MAP, {
        presets: Object.keys(projectionPresetsData ?? {})
      });
    } catch (error) {
      logger.warn('Failed to load projection presets', LogCategory.MAP, error);
    }
  }

  async function loadStylePresets(): Promise<void> {
    try {
      const response = await fetch(resolveStaticAssetUrl(STYLE_PRESETS_PATH));
      if (!response.ok) {
        logger.warn('Failed to fetch style presets', LogCategory.MAP);
        return;
      }
      stylePresetsData = await response.json();
      logger.debug('Style presets loaded', LogCategory.MAP, {
        styles: Object.keys(stylePresetsData ?? {})
      });
    } catch (error) {
      logger.warn('Failed to load style presets', LogCategory.MAP, error);
    }
  }

  async function loadGeometryFromParquet(
    filename: string,
    bbox?: [number, number, number, number]
  ): Promise<ArrowTable> {
    const start = performance.now();
    logger.debug('Loading basemap geometry', LogCategory.MAP, { filename });

    const url = getGeometryParquetUrl(filename);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch geometry ${filename}: ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const jsTable = await readGeoParquetDirect(arrayBuffer, bbox);

    logger.debug('Basemap geometry loaded', LogCategory.MAP, {
      filename,
      rows: jsTable.numRows,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return jsTable;
  }

  async function doesDuckTableExist(tableName: string): Promise<boolean> {
    if (!Duck) {
      return false;
    }

    const escapedTableName = escapeSqlString(tableName);
    const tableExists = (await Duck.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name = '${escapedTableName}'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    return tableExists.length > 0;
  }

  async function loadGeometryFromDuckTable(
    tableName: string
  ): Promise<ArrowTable> {
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    const { table: rawTable, geomColumn } = await fetchArrowTableWithGeometry(
      tableName,
      Duck
    );
    return addGeoArrowMetadataFromDuckDB(
      rawTable,
      tableName,
      Duck,
      undefined,
      geomColumn
    );
  }

  function getLoadableMetadataLayers(
    metadata: BasemapMetadata,
    layerTypes?: readonly BasemapLayerType[]
  ): BasemapMetadata['layers'] {
    const requestedTypes = layerTypes ? new Set(layerTypes) : null;
    return metadata.layers.filter(
      (layer) =>
        !!layer.file && (!requestedTypes || requestedTypes.has(layer.type))
    );
  }

  async function loadBasemapLayerTable(
    metadata: BasemapMetadata,
    layerFile: string
  ): Promise<ArrowTable> {
    const shouldReadFromDuck =
      metadata.isCustom && (await doesDuckTableExist(layerFile));
    return shouldReadFromDuck
      ? loadGeometryFromDuckTable(layerFile)
      : loadGeometryFromParquet(layerFile);
  }

  function updateProjectionFromTable(geometryTable: ArrowTable): void {
    if (projectionStore.referenceBbox !== null) {
      logger.debug(
        'Skipping basemap bbox update - referenceBbox already set (thematic-map handles switching)',
        LogCategory.MAP,
        {
          currentBbox: projectionStore.referenceBbox
        }
      );
      return;
    }

    const geoMetadata = geometryTable.schema.metadata?.get('geo');
    if (geoMetadata) {
      projectionStore.setReferenceBboxFromMetadata(geoMetadata);
      logger.debug('Projection store updated from basemap', LogCategory.MAP, {
        bbox: projectionStore.referenceBbox
      });
    }
  }

  async function loadBasemapInternal(
    basemapId: string
  ): Promise<LoadedBasemap | null> {
    if (!isInitialized) {
      logger.debug(
        `Basemap service not yet ready, waiting for initialization: ${basemapId}`,
        LogCategory.MAP
      );
      await initialize();
    }

    const metadata = availableBasemaps.find(
      (basemap) => basemap.file === basemapId
    );

    if (!metadata) {
      logger.warn(`Basemap not found: ${basemapId}`, LogCategory.MAP);
      return null;
    }

    try {
      const start = performance.now();
      logger.debug('Loading basemap', LogCategory.MAP, { basemapId });

      const geometryTable = metadata.isCustom
        ? await loadCustomBasemapGeometry(metadata)
        : await loadGeometryFromParquet(metadata.file, metadata.bbox);

      currentBasemap = createLoadedBasemapVariant(
        metadata,
        geometryTable,
        new Map()
      );

      basemapCache.set(basemapId, currentBasemap);
      updateProjectionFromTable(geometryTable);

      logger.debug('Basemap loaded', LogCategory.MAP, {
        basemapId,
        metadataLayerCount: metadata.layers.length,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return currentBasemap;
    } catch (error) {
      logger.error(
        `Failed to load basemap: ${basemapId}`,
        LogCategory.MAP,
        error
      );
      return null;
    }
  }

  async function loadCustomBasemapGeometry(
    metadata: BasemapMetadata
  ): Promise<ArrowTable> {
    const customTableName = metadata.file;
    const tableExists = await doesDuckTableExist(customTableName);

    if (!tableExists) {
      throw new Error(`Custom basemap table not found: ${customTableName}`);
    }

    return loadGeometryFromDuckTable(customTableName);
  }

  async function loadGeometryIntoDuckDB(basemapId: string): Promise<string> {
    const normalizedBasemapId =
      typeof basemapId === 'string' ? basemapId.trim() : '';
    if (!normalizedBasemapId) {
      throw new Error('Invalid basemap id for geometry loading');
    }

    const isCustomBasemap = /^custom_basemap_/i.test(normalizedBasemapId);
    const tableName = isCustomBasemap
      ? normalizedBasemapId
      : `basemap_geom_${normalizedBasemapId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    if (geometryTablesInDuckDB.has(tableName)) {
      logger.debug('Basemap geometry already in DuckDB', LogCategory.MAP, {
        basemapId: normalizedBasemapId,
        tableName
      });
      return tableName;
    }

    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    // Custom basemaps imported by the user are already materialized as DuckDB tables.
    if (isCustomBasemap) {
      const escapedBasemapId = escapeSqlString(normalizedBasemapId);
      const existingTable = (await Duck.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapedBasemapId}'`,
        { format: 'array' }
      )) as Array<{ table_name: string }>;

      if (existingTable?.length) {
        geometryTablesInDuckDB.add(tableName);
        logger.debug(
          'Using existing custom basemap table from DuckDB',
          LogCategory.MAP,
          {
            basemapId: normalizedBasemapId,
            tableName
          }
        );
        return tableName;
      }
    }

    logger.debug('Loading basemap geometry into DuckDB', LogCategory.MAP, {
      basemapId: normalizedBasemapId
    });

    try {
      const url = getGeometryParquetUrl(normalizedBasemapId);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch geometry: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const geometryFile = new File([blob], `${normalizedBasemapId}.parquet`, {
        type: 'application/octet-stream'
      });

      await Duck.register_files([geometryFile]);
      const fileId = (geometryFile as File & { id: string }).id;
      const escapedFileId = escapeSqlString(fileId);
      await Duck.query(
        `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${escapedFileId}')`
      );

      geometryTablesInDuckDB.add(tableName);

      return tableName;
    } catch (error) {
      logger.error(
        'Failed to load basemap geometry into DuckDB',
        LogCategory.MAP,
        {
          basemapId: normalizedBasemapId,
          error
        }
      );
      throw error;
    }
  }

  async function loadBasemap(basemapId: string): Promise<LoadedBasemap | null> {
    if (basemapCache.has(basemapId)) {
      logger.debug('Basemap loaded from cache', LogCategory.MAP, {
        basemapId
      });
      currentBasemap = basemapCache.get(basemapId)!;
      updateProjectionFromTable(
        getResolvedGeometryTable(currentBasemap) ?? currentBasemap.geometryTable
      );
      return currentBasemap;
    }

    const existing = loadingBasemaps.get(basemapId);
    if (existing) {
      return existing;
    }

    const promise = loadBasemapInternal(basemapId);
    loadingBasemaps.set(basemapId, promise);

    try {
      return await promise;
    } finally {
      loadingBasemaps.delete(basemapId);
    }
  }

  async function loadDefaultBasemap(): Promise<LoadedBasemap | null> {
    return loadBasemap(DEFAULT_BASEMAP_ID);
  }

  function upsertCustomBasemapMetadata(metadata: BasemapMetadata): void {
    const idx = availableBasemaps.findIndex(
      (basemap) => basemap.file === metadata.file
    );
    if (idx === -1) {
      availableBasemaps.push(metadata);
    } else {
      availableBasemaps[idx] = metadata;
    }
  }

  function registerCustomBasemapMetadata(metadata: BasemapMetadata): void {
    upsertCustomBasemapMetadata(metadata);
  }

  async function registerCustomBasemap(
    metadata: BasemapMetadata,
    geometryTable: ArrowTable
  ): Promise<void> {
    upsertCustomBasemapMetadata(metadata);
    const loaded: LoadedBasemap = createLoadedBasemapVariant(
      metadata,
      geometryTable,
      new Map()
    );
    basemapCache.set(metadata.file, loaded);
    currentBasemap = loaded;

    logger.info('Custom basemap registered', LogCategory.MAP, {
      basemapId: metadata.file,
      rows: geometryTable.numRows,
      metadataLayerCount: metadata.layers.length
    });
  }

  function getResolvedLayerTables(
    loadedBasemap: LoadedBasemap | null
  ): Map<string, ArrowTable> {
    return getResolvedBasemapVariant(loadedBasemap)?.layerTables ?? new Map();
  }

  function getResolvedGeometryTable(
    loadedBasemap: LoadedBasemap | null
  ): ArrowTable | null {
    return getResolvedBasemapVariant(loadedBasemap)?.geometryTable ?? null;
  }

  function getResolvedMetadata(
    loadedBasemap: LoadedBasemap | null
  ): BasemapMetadata | null {
    return getResolvedBasemapVariant(loadedBasemap)?.metadata ?? null;
  }

  function getResolvedVariantData(
    basemapId: string,
    level?: SimplificationLevel
  ): LoadedBasemapVariantData | null {
    return getResolvedBasemapVariant(
      basemapCache.get(basemapId) ?? null,
      level
    );
  }

  async function loadVariant(
    basemapId: string,
    variantFile: string,
    level: SimplificationLevel
  ): Promise<ArrowTable | null> {
    const loadedBasemap = basemapCache.get(basemapId);
    if (!loadedBasemap) {
      throw new Error(`Basemap not loaded: ${basemapId}`);
    }

    if (!loadedBasemap.simplifiedVariants) {
      loadedBasemap.simplifiedVariants = new Map();
    }

    const baseLevel = getBasemapSimplificationLevel(loadedBasemap.metadata);
    if (variantFile === loadedBasemap.metadata.file || level === baseLevel) {
      loadedBasemap.activeSimplificationLevel = level;
      return loadedBasemap.geometryTable;
    }

    if (loadedBasemap.simplifiedVariants.has(level)) {
      loadedBasemap.activeSimplificationLevel = level;
      return loadedBasemap.simplifiedVariants.get(level)?.geometryTable ?? null;
    }

    const start = performance.now();
    logger.debug('Loading basemap variant file', LogCategory.MAP, {
      basemapId,
      variantFile,
      level
    });

    const variantMetadata = findBasemapMetadataByFile(
      availableBasemaps,
      variantFile
    );

    if (!variantMetadata) {
      logger.warn('Basemap variant metadata not available', LogCategory.MAP, {
        basemapId,
        variantFile,
        level
      });
      return null;
    }

    const geometryTable = await loadGeometryFromParquet(
      variantMetadata.file,
      variantMetadata.bbox
    );
    const variant = createLoadedBasemapVariant(
      variantMetadata,
      geometryTable,
      new Map()
    );

    loadedBasemap.simplifiedVariants.set(level, variant);
    loadedBasemap.activeSimplificationLevel = level;
    updateProjectionFromTable(geometryTable);

    logger.debug('Basemap variant loaded', LogCategory.MAP, {
      basemapId,
      variantFile,
      level,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return geometryTable;
  }

  async function ensureVariantLayersLoaded(
    variant: LoadedBasemapVariantState,
    layerTypes?: readonly BasemapLayerType[]
  ): Promise<boolean> {
    const loadableLayers = getLoadableMetadataLayers(
      variant.metadata,
      layerTypes
    );
    if (loadableLayers.length === 0) {
      return false;
    }

    let startedNewLoad = false;
    const pendingLoads: Promise<ArrowTable | null>[] = [];

    for (const layer of loadableLayers) {
      const layerFile = layer.file;
      if (!layerFile) {
        continue;
      }

      if (
        variant.layerTables.has(layerFile) ||
        variant.failedLayerFiles.has(layerFile)
      ) {
        continue;
      }

      let loadPromise = variant.loadingLayerTables.get(layerFile);
      if (!loadPromise) {
        startedNewLoad = true;
        loadPromise = loadBasemapLayerTable(variant.metadata, layerFile)
          .then((table) => {
            variant.layerTables.set(layerFile, table);
            variant.failedLayerFiles.delete(layerFile);
            return table;
          })
          .catch((error) => {
            variant.failedLayerFiles.add(layerFile);
            logger.warn('Failed to load basemap layer', LogCategory.MAP, {
              basemapId: variant.metadata.file,
              layerFile,
              error
            });
            return null;
          })
          .finally(() => {
            variant.loadingLayerTables.delete(layerFile);
          });
        variant.loadingLayerTables.set(layerFile, loadPromise);
      }

      pendingLoads.push(loadPromise);
    }

    if (!startedNewLoad) {
      return false;
    }

    await Promise.all(pendingLoads);
    return true;
  }

  async function ensureCurrentLayersLoaded(
    layerTypes?: readonly BasemapLayerType[]
  ): Promise<boolean> {
    if (!currentBasemap) {
      return false;
    }

    const resolvedVariant = getResolvedBasemapVariantState(currentBasemap);
    if (!resolvedVariant) {
      return false;
    }

    return ensureVariantLayersLoaded(resolvedVariant, layerTypes);
  }

  async function ensureAttributesLoaded(): Promise<void> {
    if (!Duck || attributesLoaded) {
      return;
    }

    if (!isInitialized) {
      await initialize();
    }

    await loadAttributesIntoDuckDB();
  }

  function getLayerTableByType(layerType: BasemapLayerType): ArrowTable | null {
    if (!currentBasemap) {
      return null;
    }

    const metadata = getResolvedMetadata(currentBasemap);
    if (!metadata) {
      return null;
    }

    const layer = metadata.layers.find(
      (candidate) => candidate.type === layerType
    );

    if (!layer) {
      return null;
    }

    if (!layer.file) {
      return getResolvedGeometryTable(currentBasemap);
    }

    return getResolvedLayerTables(currentBasemap).get(layer.file) ?? null;
  }

  interface ResolvedMetadataLayer {
    table: ArrowTable;
    style: string | null;
    type: BasemapLayerType;
    file: string;
  }

  function getLayersByType(
    layerType: BasemapLayerType
  ): ResolvedMetadataLayer[] {
    if (!currentBasemap) return [];

    const results: ResolvedMetadataLayer[] = [];
    const metadata = getResolvedMetadata(currentBasemap);
    if (!metadata) return results;
    const layerTables = getResolvedLayerTables(currentBasemap);

    for (const layer of metadata.layers) {
      if (layer.type !== layerType || !layer.file) continue;
      const table = layerTables.get(layer.file);
      if (!table) continue;
      results.push({
        table,
        style: layer.style ?? null,
        type: layer.type,
        file: layer.file
      });
    }

    return results;
  }

  function clearSimplificationCache(basemapId?: string): void {
    if (basemapId) {
      const loadedBasemap = basemapCache.get(basemapId);
      if (loadedBasemap) {
        loadedBasemap.simplifiedVariants?.clear();
        loadedBasemap.activeSimplificationLevel = null;
        logger.debug(
          'Simplification cache cleared for basemap',
          LogCategory.MAP,
          { basemapId }
        );
      }
    } else {
      for (const [_id, basemap] of basemapCache) {
        basemap.simplifiedVariants?.clear();
        basemap.activeSimplificationLevel = null;
      }
      logger.debug(
        'Simplification cache cleared for all basemaps',
        LogCategory.MAP
      );
    }
  }

  function reset(): void {
    currentBasemap = null;
    geometryTablesInDuckDB.clear();
  }

  function clearCache(): void {
    basemapCache.clear();
    geometryTablesInDuckDB.clear();
    logger.debug('Basemap cache cleared', LogCategory.MAP);
  }

  async function initialize(): Promise<void> {
    if (isInitialized) {
      return;
    }

    if (initializePromise) {
      await initializePromise;
      return;
    }

    initializePromise = (async () => {
      try {
        logger.debug('Initializing basemap service', LogCategory.MAP);

        await Promise.all([
          loadMetadata(),
          loadProjectionPresets(),
          loadStylePresets()
        ]);

        isInitialized = true;
      } catch (error) {
        logger.error(
          'Failed to initialize basemap service',
          LogCategory.MAP,
          error
        );
      } finally {
        initializePromise = null;
      }
    })();

    await initializePromise;
  }

  return {
    initialize,
    loadGeometryIntoDuckDB,
    loadBasemap,
    loadDefaultBasemap,
    registerCustomBasemapMetadata,
    registerCustomBasemap,
    get availableBasemaps(): BasemapMetadata[] {
      return availableBasemaps;
    },
    get currentBasemap(): LoadedBasemap | null {
      return currentBasemap;
    },
    get currentMetadata(): BasemapMetadata | null {
      return getResolvedMetadata(currentBasemap);
    },
    get currentGeometryTable(): ArrowTable | null {
      return getResolvedGeometryTable(currentBasemap);
    },
    get currentLayers(): Map<string, ArrowTable> {
      return getResolvedLayerTables(currentBasemap);
    },
    getResolvedVariantData,
    getLayerTableByType,
    getLayersByType,
    ensureCurrentLayersLoaded,
    ensureAttributesLoaded,
    get projectionPresets(): ProjectionPresets | null {
      return projectionPresetsData;
    },
    get stylePresets(): StylePresets | null {
      return stylePresetsData;
    },
    loadVariant,
    clearSimplificationCache,
    reset,
    clearCache
  };
}

export const basemapService = createBasemapService();
