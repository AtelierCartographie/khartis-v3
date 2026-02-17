import { base } from '$app/paths';
import { Duck } from '$lib/features/duckdb';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import { LogCategory, logger } from '../../commons/utils/logger';
import { escapeSqlString } from '../../commons/utils/sanitize.utils';
import { projectionStore } from '../stores/projection.store.svelte';
import type { BasemapLayer, BasemapMetadata } from '../types/basemap.types';
import type {
  FeatureCollection,
  Point,
  Polygon,
  MultiPolygon,
  LineString,
  MultiLineString
} from 'geojson';
import {
  readGeoJSONAsArrow,
  readGeoParquetViaDuckDB
} from '../utils/read-geojson-arrow';
import { SimplificationLevel } from '../../commons/types/enums';
import {
  simplifyGeometryTable,
  getSimplifiedArrowTable,
  SIMPLIFICATION_TOLERANCE
} from '../../duckdb/operations/simplification';

interface AdditionalBasemapData {
  lakesData: FeatureCollection<Polygon | MultiPolygon> | null;
  riversData: FeatureCollection<LineString | MultiLineString> | null;
  citiesData: FeatureCollection<Point> | null;
}

const BASEMAP_METADATA_URL = `${base}/basemaps/all-basemaps-metadata.json`;
const BASEMAP_ATTRIBUTES_URL = `${base}/basemaps/all-basemaps-attributes.parquet`;
const GEOMETRY_BASE_PATH = `${base}/basemaps/geometry/`;
const DEFAULT_BASEMAP_ID = 'world-countries-50m';
const LAKES_FILE = 'ne_110m_lakes';
const RIVERS_FILE = 'ne_110m_rivers_lake_centerlines';
const CITIES_FILE = 'ne_110m_populated_places_simple';

interface LoadedBasemap {
  metadata: BasemapMetadata;
  geometryTable: ArrowTable;
  layerTables: SvelteMap<string, ArrowTable>;
  simplifiedVariants?: SvelteMap<SimplificationLevel, ArrowTable>;
  activeSimplificationLevel?: SimplificationLevel | null;
}

function createBasemapService() {
  let availableBasemaps: BasemapMetadata[] = [];
  let currentBasemap: LoadedBasemap | null = null;
  let attributesLoaded = false;
  const basemapCache = new SvelteMap<string, LoadedBasemap>();
  const additionalData: AdditionalBasemapData = {
    lakesData: null,
    riversData: null,
    citiesData: null
  };
  const geometryTablesInDuckDB = new Set<string>();
  const loadingBasemaps = new Map<string, Promise<LoadedBasemap | null>>();

  async function loadMetadata(): Promise<void> {
    try {
      logger.info('Loading basemap metadata catalog', LogCategory.MAP);
      const response = await fetch(BASEMAP_METADATA_URL);

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
      const response = await fetch(BASEMAP_ATTRIBUTES_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch attributes: ${response.statusText}`);
      }

      logger.info('Loading basemap attributes into DuckDB', LogCategory.MAP);
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

      attributesLoaded = true;
      logger.success('Basemap attributes stored in DuckDB', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to load basemap attributes', LogCategory.MAP, error);
      throw error;
    }
  }

  async function fetchGeometryFile(
    filename: string
  ): Promise<{ response: Response; isGeoJSON: boolean }> {
    let url = `${GEOMETRY_BASE_PATH}${filename}.geojson`;
    let response = await fetch(url);

    if (response.ok) {
      return { response, isGeoJSON: true };
    }

    url = `${GEOMETRY_BASE_PATH}${filename}.parquet`;
    response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch geometry: ${response.statusText}`);
    }

    return { response, isGeoJSON: false };
  }

  async function loadGeometryFromParquet(
    filename: string
  ): Promise<ArrowTable> {
    const start = performance.now();
    logger.debug('Loading basemap geometry', LogCategory.MAP, { filename });

    const { response, isGeoJSON } = await fetchGeometryFile(filename);

    let jsTable: ArrowTable;

    if (isGeoJSON) {
      const geojsonText = await response.text();
      jsTable = await readGeoJSONAsArrow(geojsonText, `basemap_${filename}`);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      jsTable = await readGeoParquetViaDuckDB(
        arrayBuffer,
        `basemap_${filename}`
      );
    }

    logger.success('Basemap geometry loaded', LogCategory.MAP, {
      filename,
      rows: jsTable.numRows,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return jsTable;
  }

  async function loadBasemapLayers(
    layers: BasemapLayer[]
  ): Promise<SvelteMap<string, ArrowTable>> {
    const layerTables = new SvelteMap<string, ArrowTable>();

    for (const layer of layers) {
      if (!layer.file) {
        continue;
      }
      try {
        logger.debug('Loading basemap layer geometry', LogCategory.MAP, {
          layerFile: layer.file
        });
        const table = await loadGeometryFromParquet(layer.file);
        layerTables.set(layer.file, table);
      } catch (error) {
        logger.warn('Failed to load basemap layer', LogCategory.MAP, {
          layerFile: layer.file,
          error
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
    const metadata = availableBasemaps.find(
      (basemap) => basemap.file === basemapId
    );

    if (!metadata) {
      logger.error(`Basemap not found: ${basemapId}`, LogCategory.MAP);
      return null;
    }

    try {
      const start = performance.now();
      logger.info('Loading basemap', LogCategory.MAP, { basemapId });

      const geometryTable = await loadGeometryFromParquet(metadata.file);
      const layerTables = await loadBasemapLayers(metadata.layers);

      currentBasemap = {
        metadata,
        geometryTable,
        layerTables
      };

      basemapCache.set(basemapId, currentBasemap);
      updateProjectionFromTable(geometryTable);

      logger.success('Basemap loaded', LogCategory.MAP, {
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

  async function loadGeometryIntoDuckDB(basemapId: string): Promise<string> {
    const tableName = `basemap_geom_${basemapId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    if (geometryTablesInDuckDB.has(tableName)) {
      logger.debug('Basemap geometry already in DuckDB', LogCategory.MAP, {
        basemapId,
        tableName
      });
      return tableName;
    }

    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    // Custom basemaps imported by the user are already materialized as DuckDB tables.
    // Reuse that table directly instead of trying to fetch a static geometry file.
    if (/^custom_basemap_/i.test(basemapId)) {
      const escapedBasemapId = escapeSqlString(basemapId);
      const existingTable = (await Duck.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapedBasemapId}'`,
        { format: 'array' }
      )) as Array<{ table_name: string }>;

      if (existingTable?.length) {
        geometryTablesInDuckDB.add(basemapId);
        logger.debug(
          'Using existing custom basemap table from DuckDB',
          LogCategory.MAP,
          {
            basemapId,
            tableName: basemapId
          }
        );
        return basemapId;
      }
    }

    const start = performance.now();
    logger.info('Loading basemap geometry into DuckDB', LogCategory.MAP, {
      basemapId
    });

    try {
      const { response, isGeoJSON } = await fetchGeometryFile(basemapId);

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const geometryFile = new File(
        [blob],
        isGeoJSON ? `${basemapId}.geojson` : `${basemapId}.parquet`,
        { type: 'application/octet-stream' }
      );

      await Duck.register_files([geometryFile]);
      await Duck.read_geofile(geometryFile, { tablename: tableName });

      geometryTablesInDuckDB.add(tableName);

      logger.success('Basemap geometry loaded into DuckDB', LogCategory.MAP, {
        basemapId,
        tableName,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return tableName;
    } catch (error) {
      logger.error(
        'Failed to load basemap geometry into DuckDB',
        LogCategory.MAP,
        {
          basemapId,
          error
        }
      );
      throw error;
    }
  }

  async function loadBasemap(basemapId: string): Promise<LoadedBasemap | null> {
    if (basemapCache.has(basemapId)) {
      logger.debug('Basemap loaded from cache', LogCategory.MAP, { basemapId });
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

  function registerCustomBasemap(
    metadata: BasemapMetadata,
    geometryTable: ArrowTable
  ): void {
    const idx = availableBasemaps.findIndex(
      (basemap) => basemap.file === metadata.file
    );
    if (idx === -1) {
      availableBasemaps.push(metadata);
    } else {
      availableBasemaps[idx] = metadata;
    }

    const loaded: LoadedBasemap = {
      metadata,
      geometryTable,
      layerTables: new SvelteMap<string, ArrowTable>()
    };
    basemapCache.set(metadata.file, loaded);

    logger.info('Custom basemap registered', LogCategory.MAP, {
      basemapId: metadata.file,
      rows: geometryTable.numRows
    });
  }

  async function loadLakesData(): Promise<void> {
    if (additionalData.lakesData) return;

    try {
      const url = `${GEOMETRY_BASE_PATH}${LAKES_FILE}.geojson`;
      const response = await fetch(url);

      if (!response.ok) {
        logger.debug('Lakes data not available', LogCategory.MAP);
        return;
      }

      const geojson = await response.json();
      additionalData.lakesData = geojson as FeatureCollection<
        Polygon | MultiPolygon
      >;
      logger.debug('Lakes data loaded', LogCategory.MAP, {
        features: additionalData.lakesData.features.length
      });
    } catch (error) {
      logger.warn('Failed to load lakes data', LogCategory.MAP, error);
    }
  }

  async function loadRiversData(): Promise<void> {
    if (additionalData.riversData) return;

    try {
      const url = `${GEOMETRY_BASE_PATH}${RIVERS_FILE}.geojson`;
      const response = await fetch(url);

      if (!response.ok) {
        logger.debug('Rivers data not available', LogCategory.MAP);
        return;
      }

      const geojson = await response.json();
      additionalData.riversData = geojson as FeatureCollection<
        LineString | MultiLineString
      >;
      logger.debug('Rivers data loaded', LogCategory.MAP, {
        features: additionalData.riversData.features.length
      });
    } catch (error) {
      logger.warn('Failed to load rivers data', LogCategory.MAP, error);
    }
  }

  async function loadCitiesData(): Promise<void> {
    if (additionalData.citiesData) return;

    try {
      const url = `${GEOMETRY_BASE_PATH}${CITIES_FILE}.geojson`;
      const response = await fetch(url);

      if (!response.ok) {
        logger.debug('Cities data not available', LogCategory.MAP);
        return;
      }

      const geojson = await response.json();
      additionalData.citiesData = geojson as FeatureCollection<Point>;
      logger.debug('Cities data loaded', LogCategory.MAP, {
        features: additionalData.citiesData.features.length
      });
    } catch (error) {
      logger.warn('Failed to load cities data', LogCategory.MAP, error);
    }
  }

  async function loadAdditionalLayers(): Promise<void> {
    await Promise.all([loadLakesData(), loadRiversData(), loadCitiesData()]);
  }

  async function simplifyBasemap(
    basemapId: string,
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
      logger.debug('Using cached simplified basemap', LogCategory.MAP, {
        basemapId,
        level
      });
      loadedBasemap.activeSimplificationLevel = level;
      return loadedBasemap.simplifiedVariants.get(level)!;
    }

    const start = performance.now();
    logger.info('Simplifying basemap geometry', LogCategory.MAP, {
      basemapId,
      level
    });

    try {
      const tableName = await loadGeometryIntoDuckDB(basemapId);
      const tolerance = SIMPLIFICATION_TOLERANCE[level];

      const metrics = await simplifyGeometryTable(Duck, tableName, tolerance);

      const simplifiedTable = await getSimplifiedArrowTable(
        Duck,
        tableName,
        tolerance
      );

      loadedBasemap.simplifiedVariants.set(level, simplifiedTable);
      loadedBasemap.activeSimplificationLevel = level;

      logger.success('Basemap geometry simplified', LogCategory.MAP, {
        basemapId,
        level,
        originalVertices: metrics.originalVertices,
        simplifiedVertices: metrics.simplifiedVertices,
        reductionPercentage: `${metrics.reductionPercentage}%`,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return simplifiedTable;
    } catch (error) {
      logger.error('Failed to simplify basemap geometry', LogCategory.MAP, {
        basemapId,
        level,
        error
      });
      throw error;
    }
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

  function clearSimplificationCache(basemapId?: string): void {
    if (basemapId) {
      const loadedBasemap = basemapCache.get(basemapId);
      if (loadedBasemap) {
        loadedBasemap.simplifiedVariants?.clear();
        loadedBasemap.activeSimplificationLevel = null;
        logger.debug(
          'Simplification cache cleared for basemap',
          LogCategory.MAP,
          {
            basemapId
          }
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
      logger.info('Initializing basemap service', LogCategory.MAP);
      await loadMetadata();

      if (Duck) {
        await loadAttributesIntoDuckDB();
      } else {
        logger.warn(
          'DuckDB not available, skipping basemap attributes preloading',
          LogCategory.MAP
        );
      }

      loadAdditionalLayers().catch((err) => {
        logger.warn(
          'Failed to load additional basemap layers',
          LogCategory.MAP,
          err
        );
      });

      logger.success('Basemap service initialized', LogCategory.MAP, {
        basemapCount: availableBasemaps.length
      });
    } catch (error) {
      logger.error(
        'Failed to initialize basemap service',
        LogCategory.MAP,
        error
      );
    }
  }

  return {
    initialize,
    loadGeometryIntoDuckDB,
    loadBasemap,
    loadDefaultBasemap,
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
      return currentBasemap?.layerTables ?? new Map();
    },
    get lakesData(): FeatureCollection<Polygon | MultiPolygon> | null {
      return additionalData.lakesData;
    },
    get riversData(): FeatureCollection<LineString | MultiLineString> | null {
      return additionalData.riversData;
    },
    get citiesData(): FeatureCollection<Point> | null {
      return additionalData.citiesData;
    },
    loadAdditionalLayers,
    simplifyBasemap,
    getSimplifiedBasemapTable,
    clearSimplificationCache,
    reset,
    clearCache
  };
}

export const basemapService = createBasemapService();
