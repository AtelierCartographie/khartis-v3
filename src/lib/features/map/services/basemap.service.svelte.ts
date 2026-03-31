import { Duck } from '$lib/features/duckdb';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { type Table as ArrowTable } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import { escapeSqlString } from '../../commons/utils/sanitize.utils';
import { projectionStore } from '../stores/projection.store.svelte';
import type {
  BasemapMetadata,
  ProjectionPresets,
  StylePresets
} from '../types/basemap.types';
import { readGeoParquetViaDuckDB } from '../utils/read-geojson-arrow';
import { SimplificationLevel } from '../../commons/types/enums';
import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry
} from '../../duckdb/orchestrator/arrow-ops';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';
const BASEMAP_ATTRIBUTES_PATH = '/basemaps/all-basemaps-attributes.parquet';
const PROJECTION_PRESETS_PATH = '/basemaps/projection-presets.json';
const STYLE_PRESETS_PATH = '/basemaps/style-presets.json';
const GEOMETRY_BASE_PATH = '/basemaps/geometry';
const DEFAULT_BASEMAP_ID = 'monde-countries-2024-medium';

function getGeometryParquetUrl(filename: string): string {
  return resolveStaticAssetUrl(`${GEOMETRY_BASE_PATH}/${filename}.parquet`);
}

interface LoadedBasemap {
  metadata: BasemapMetadata;
  geometryTable: ArrowTable;
  layerTables: SvelteMap<string, ArrowTable>;
  simplifiedVariants?: SvelteMap<SimplificationLevel, ArrowTable>;
  activeSimplificationLevel?: SimplificationLevel | null;
}

function createBasemapService() {
  let availableBasemaps: BasemapMetadata[] = [];
  let isInitialized = false;
  let initResolve: (() => void) | null = null;
  const initPromise = new Promise<void>((resolve) => {
    initResolve = resolve;
  });
  let currentBasemap: LoadedBasemap | null = null;
  let attributesLoaded = false;
  let projectionPresetsData: ProjectionPresets | null = null;
  let stylePresetsData: StylePresets | null = null;
  const basemapCache = new SvelteMap<string, LoadedBasemap>();
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
    const jsTable = await readGeoParquetViaDuckDB(
      arrayBuffer,
      `basemap_${filename}`,
      bbox
    );

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

    const rawTable = await fetchArrowTableWithGeometry(tableName, Duck);
    return addGeoArrowMetadataFromDuckDB(rawTable, tableName, Duck);
  }

  async function loadBasemapLayers(
    metadata: BasemapMetadata
  ): Promise<SvelteMap<string, ArrowTable>> {
    const layerTables = new SvelteMap<string, ArrowTable>();

    const loadableLayers = metadata.layers.filter((l) => l.file);
    if (loadableLayers.length === 0) return layerTables;

    const results = await Promise.allSettled(
      loadableLayers.map(async (layer) => {
        const table =
          metadata.isCustom && (await doesDuckTableExist(layer.file!))
            ? await loadGeometryFromDuckTable(layer.file!)
            : await loadGeometryFromParquet(layer.file!);
        return { file: layer.file!, table };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        layerTables.set(result.value.file, result.value.table);
      } else {
        logger.warn('Failed to load basemap layer', LogCategory.MAP, {
          error: result.reason
        });
      }
    }

    return layerTables;
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
      await initPromise;
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

      const [geometryTable, layerTables] = await Promise.all([
        metadata.isCustom
          ? loadCustomBasemapGeometry(metadata)
          : loadGeometryFromParquet(metadata.file, metadata.bbox),
        loadBasemapLayers(metadata)
      ]);

      currentBasemap = {
        metadata,
        geometryTable,
        layerTables
      };

      basemapCache.set(basemapId, currentBasemap);
      updateProjectionFromTable(geometryTable);

      logger.debug('Basemap loaded', LogCategory.MAP, {
        basemapId,
        layerCount: metadata.layers.length,
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
      updateProjectionFromTable(currentBasemap.geometryTable);
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
    const layerTables = await loadBasemapLayers(metadata);

    const loaded: LoadedBasemap = {
      metadata,
      geometryTable,
      layerTables
    };
    basemapCache.set(metadata.file, loaded);
    currentBasemap = loaded;

    logger.info('Custom basemap registered', LogCategory.MAP, {
      basemapId: metadata.file,
      rows: geometryTable.numRows,
      layerCount: layerTables.size
    });
  }

  function getResolvedLayerTables(
    loadedBasemap: LoadedBasemap | null
  ): Map<string, ArrowTable> {
    if (!loadedBasemap) {
      return new Map();
    }

    return loadedBasemap.layerTables;
  }

  async function loadVariant(
    basemapId: string,
    variantFile: string,
    level: SimplificationLevel
  ): Promise<ArrowTable> {
    const loadedBasemap = basemapCache.get(basemapId);
    if (!loadedBasemap) {
      throw new Error(`Basemap not loaded: ${basemapId}`);
    }

    if (!loadedBasemap.simplifiedVariants) {
      loadedBasemap.simplifiedVariants = new SvelteMap<
        SimplificationLevel,
        ArrowTable
      >();
    }

    if (loadedBasemap.simplifiedVariants.has(level)) {
      loadedBasemap.activeSimplificationLevel = level;
      return loadedBasemap.simplifiedVariants.get(level)!;
    }

    const start = performance.now();
    logger.debug('Loading basemap variant file', LogCategory.MAP, {
      basemapId,
      variantFile,
      level
    });

    const variantTableName = `basemap_variant_${basemapId.replace(/[^a-zA-Z0-9_]/g, '_')}_${level}`;

    const variantUrl = getGeometryParquetUrl(variantFile);
    const response = await fetch(variantUrl);
    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('Basemap variant not available', LogCategory.MAP, {
          basemapId,
          variantFile,
          level
        });
        return null as unknown as ArrowTable;
      }
      throw new Error(
        `Failed to fetch basemap variant ${variantFile}: ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const variantTable = await readGeoParquetViaDuckDB(
      arrayBuffer,
      variantTableName
    );

    loadedBasemap.simplifiedVariants.set(level, variantTable);
    loadedBasemap.activeSimplificationLevel = level;

    logger.debug('Basemap variant loaded', LogCategory.MAP, {
      basemapId,
      variantFile,
      level,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return variantTable;
  }

  function getSimplifiedBasemapTable(
    basemapId: string,
    level?: SimplificationLevel
  ): ArrowTable | null {
    const loadedBasemap = basemapCache.get(basemapId);

    if (!loadedBasemap) {
      return null;
    }

    const targetLevel = level ?? loadedBasemap.activeSimplificationLevel;

    if (!targetLevel || !loadedBasemap.simplifiedVariants) {
      return null;
    }

    return loadedBasemap.simplifiedVariants.get(targetLevel) ?? null;
  }

  function getLayerTableByType(layerType: BasemapLayerType): ArrowTable | null {
    if (!currentBasemap) {
      return null;
    }

    const layer = currentBasemap.metadata.layers.find(
      (candidate) => candidate.type === layerType
    );

    if (!layer) {
      return null;
    }

    if (!layer.file) {
      const activeLevel = currentBasemap.activeSimplificationLevel;
      if (activeLevel) {
        return (
          currentBasemap.simplifiedVariants?.get(activeLevel) ??
          currentBasemap.geometryTable
        );
      }

      return currentBasemap.geometryTable;
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
    const layerTables = getResolvedLayerTables(currentBasemap);

    for (const layer of currentBasemap.metadata.layers) {
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
    try {
      logger.debug('Initializing basemap service', LogCategory.MAP);

      await Promise.all([
        loadMetadata(),
        loadProjectionPresets(),
        loadStylePresets()
      ]);

      if (Duck) {
        await loadAttributesIntoDuckDB();
      } else {
        logger.warn(
          'DuckDB not available, skipping basemap attributes preloading',
          LogCategory.MAP
        );
      }

      isInitialized = true;
      initResolve?.();
    } catch (error) {
      logger.error(
        'Failed to initialize basemap service',
        LogCategory.MAP,
        error
      );
      // Resolve even on error to unblock waiters
      initResolve?.();
    }
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
    get currentGeometryTable(): ArrowTable | null {
      return currentBasemap?.geometryTable ?? null;
    },
    get currentLayers(): Map<string, ArrowTable> {
      return getResolvedLayerTables(currentBasemap);
    },
    getLayerTableByType,
    getLayersByType,
    get projectionPresets(): ProjectionPresets | null {
      return projectionPresetsData;
    },
    get stylePresets(): StylePresets | null {
      return stylePresetsData;
    },
    loadVariant,
    getSimplifiedBasemapTable,
    clearSimplificationCache,
    reset,
    clearCache
  };
}

export const basemapService = createBasemapService();
