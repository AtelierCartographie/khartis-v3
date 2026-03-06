import { Duck } from '$lib/features/duckdb';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { type Table as ArrowTable } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import {
  escapeIdentifier,
  escapeSqlString
} from '../../commons/utils/sanitize.utils';
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
  SIMPLIFICATION_FACTOR
} from '../../duckdb/operations/simplification';
import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry
} from '../../duckdb/orchestrator/arrow-ops';
import {
  getBasemapCentroidsTableName,
  getBasemapInnerlinesTableName
} from '../utils/basemap-import.utils';

interface AdditionalBasemapData {
  lakesData: FeatureCollection<Polygon | MultiPolygon> | null;
  riversData: FeatureCollection<LineString | MultiLineString> | null;
  citiesData: FeatureCollection<Point> | null;
}

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';
const BASEMAP_ATTRIBUTES_PATH = '/basemaps/all-basemaps-attributes.parquet';
const GEOMETRY_BASE_PATH = '/basemaps/geometry';
const DEFAULT_BASEMAP_ID = 'world-countries-50m';
const LAKES_FILE = 'ne_110m_lakes';
const RIVERS_FILE = 'ne_110m_rivers_lake_centerlines';
const CITIES_FILE = 'ne_110m_populated_places_simple';

function getBasemapMetadataUrl(): string {
  return resolveStaticAssetUrl(BASEMAP_METADATA_PATH);
}

function getBasemapAttributesUrl(): string {
  return resolveStaticAssetUrl(BASEMAP_ATTRIBUTES_PATH);
}

function getGeometryUrl(
  filename: string,
  extension: 'geojson' | 'parquet'
): string {
  return resolveStaticAssetUrl(
    `${GEOMETRY_BASE_PATH}/${filename}.${extension}`
  );
}

interface LoadedBasemap {
  metadata: BasemapMetadata;
  geometryTable: ArrowTable;
  layerTables: SvelteMap<string, ArrowTable>;
  simplifiedVariants?: SvelteMap<SimplificationLevel, ArrowTable>;
  simplifiedLayerVariants?: SvelteMap<
    SimplificationLevel,
    SvelteMap<string, ArrowTable>
  >;
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
      const response = await fetch(getBasemapMetadataUrl());

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
      const response = await fetch(getBasemapAttributesUrl());

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
    let url = getGeometryUrl(filename, 'geojson');
    let response = await fetch(url);

    if (response.ok) {
      return { response, isGeoJSON: true };
    }

    url = getGeometryUrl(filename, 'parquet');
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

  function getPrimaryLayer(metadata: BasemapMetadata): BasemapLayer | null {
    return (
      metadata.layers.find((layer) => !layer.file) ?? metadata.layers[0] ?? null
    );
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

    for (const layer of metadata.layers) {
      if (!layer.file) {
        continue;
      }
      try {
        logger.debug('Loading basemap layer geometry', LogCategory.MAP, {
          layerFile: layer.file
        });
        const table =
          metadata.isCustom && (await doesDuckTableExist(layer.file))
            ? await loadGeometryFromDuckTable(layer.file)
            : await loadGeometryFromParquet(layer.file);
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

      const geometryTable = metadata.isCustom
        ? await loadCustomBasemapGeometry(metadata)
        : await loadGeometryFromParquet(metadata.file);
      const layerTables = await loadBasemapLayers(metadata);

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
    // Reuse that table directly instead of trying to fetch a static geometry file.
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

    const start = performance.now();
    logger.info('Loading basemap geometry into DuckDB', LogCategory.MAP, {
      basemapId: normalizedBasemapId
    });

    try {
      const { response, isGeoJSON } =
        await fetchGeometryFile(normalizedBasemapId);

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const geometryFile = new File(
        [blob],
        isGeoJSON
          ? `${normalizedBasemapId}.geojson`
          : `${normalizedBasemapId}.parquet`,
        { type: 'application/octet-stream' }
      );

      await Duck.register_files([geometryFile]);
      await Duck.read_geofile(geometryFile, { tablename: tableName });

      geometryTablesInDuckDB.add(tableName);

      logger.success('Basemap geometry loaded into DuckDB', LogCategory.MAP, {
        basemapId: normalizedBasemapId,
        tableName,
        durationMs: (performance.now() - start).toFixed(2)
      });

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

  async function loadLakesData(): Promise<void> {
    if (additionalData.lakesData) return;

    try {
      const url = getGeometryUrl(LAKES_FILE, 'geojson');
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
      const url = getGeometryUrl(RIVERS_FILE, 'geojson');
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
      const url = getGeometryUrl(CITIES_FILE, 'geojson');
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

  async function buildSimplifiedCustomLayerTables(
    loadedBasemap: LoadedBasemap,
    simplifiedTableName: string
  ): Promise<SvelteMap<string, ArrowTable>> {
    const layerTables = new SvelteMap<string, ArrowTable>();
    const escapedSimplifiedTable = escapeIdentifier(simplifiedTableName);

    for (const layer of loadedBasemap.metadata.layers) {
      if (!layer.file) {
        continue;
      }

      let sourceTableName: string | null = null;

      if (layer.type === BasemapLayerType.LIMIT) {
        sourceTableName = getBasemapInnerlinesTableName(simplifiedTableName);
        await Duck.query(`
          CREATE OR REPLACE TABLE "${escapeIdentifier(sourceTableName)}" AS
          FROM extract_innerlines('${escapeSqlString(simplifiedTableName)}')
        `);
      } else if (layer.type === BasemapLayerType.CENTROID) {
        sourceTableName = getBasemapCentroidsTableName(simplifiedTableName);
        await Duck.query(`
          CREATE OR REPLACE TABLE "${escapeIdentifier(sourceTableName)}" AS
          SELECT * REPLACE (
            ST_MaximumInscribedCircle("geom").center AS "geom"
          )
          FROM "${escapedSimplifiedTable}"
          WHERE "geom" IS NOT NULL
        `);
      }

      if (sourceTableName) {
        const table = await loadGeometryFromDuckTable(sourceTableName);
        layerTables.set(layer.file, table);
        continue;
      }

      const originalTable = loadedBasemap.layerTables.get(layer.file);
      if (originalTable) {
        layerTables.set(layer.file, originalTable);
      }
    }

    return layerTables;
  }

  function getResolvedLayerTables(
    loadedBasemap: LoadedBasemap | null
  ): Map<string, ArrowTable> {
    if (!loadedBasemap) {
      return new Map();
    }

    const activeLevel = loadedBasemap.activeSimplificationLevel;
    if (
      activeLevel &&
      loadedBasemap.simplifiedLayerVariants?.has(activeLevel)
    ) {
      return loadedBasemap.simplifiedLayerVariants.get(activeLevel)!;
    }

    return loadedBasemap.layerTables;
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

    if (!loadedBasemap.simplifiedLayerVariants) {
      loadedBasemap.simplifiedLayerVariants = new SvelteMap<
        SimplificationLevel,
        SvelteMap<string, ArrowTable>
      >();
    }

    const primaryLayer = getPrimaryLayer(loadedBasemap.metadata);
    if (!primaryLayer) {
      throw new Error(`Basemap has no primary layer: ${basemapId}`);
    }

    if (primaryLayer.type !== BasemapLayerType.POLYGON) {
      logger.info(
        'Skipping topology-aware simplification for non-polygon basemap',
        LogCategory.MAP,
        { basemapId, layerType: primaryLayer.type }
      );
      loadedBasemap.activeSimplificationLevel = null;
      return loadedBasemap.geometryTable;
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
      const tolerance = SIMPLIFICATION_FACTOR[level];
      const geometryColumn = loadedBasemap.metadata.isCustom
        ? primaryLayer.name
        : 'geom';

      const metrics = await simplifyGeometryTable(Duck, tableName, tolerance, {
        geometryColumn
      });

      const simplifiedTable = await getSimplifiedArrowTable(
        Duck,
        tableName,
        tolerance,
        { geometryColumn }
      );

      loadedBasemap.simplifiedVariants.set(level, simplifiedTable);

      if (
        loadedBasemap.metadata.isCustom &&
        loadedBasemap.layerTables.size > 0
      ) {
        const simplifiedLayerTables = await buildSimplifiedCustomLayerTables(
          loadedBasemap,
          `${tableName}_simplified`
        );
        loadedBasemap.simplifiedLayerVariants.set(level, simplifiedLayerTables);
      }

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
    logger.info('Loading basemap variant file', LogCategory.MAP, {
      basemapId,
      variantFile,
      level
    });

    const variantTableName = `basemap_variant_${basemapId.replace(/[^a-zA-Z0-9_]/g, '_')}_${level}`;

    await Duck.query(
      `CREATE OR REPLACE TABLE "${variantTableName}" AS SELECT * FROM '${variantFile}'`
    );

    const variantTable = (await Duck.query(
      `SELECT * FROM "${variantTableName}"`,
      { format: 'arrow-table' }
    )) as ArrowTable;

    loadedBasemap.simplifiedVariants.set(level, variantTable);
    loadedBasemap.activeSimplificationLevel = level;

    logger.success('Basemap variant loaded', LogCategory.MAP, {
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

  function clearSimplificationCache(basemapId?: string): void {
    if (basemapId) {
      const loadedBasemap = basemapCache.get(basemapId);
      if (loadedBasemap) {
        loadedBasemap.simplifiedVariants?.clear();
        loadedBasemap.simplifiedLayerVariants?.clear();
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
        basemap.simplifiedLayerVariants?.clear();
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
    loadVariant,
    getSimplifiedBasemapTable,
    clearSimplificationCache,
    reset,
    clearCache
  };
}

export const basemapService = createBasemapService();
