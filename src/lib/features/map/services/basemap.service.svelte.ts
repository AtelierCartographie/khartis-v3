import { base } from '$app/paths';
import { Duck } from '$lib/features/duckdb';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import { LogCategory, logger } from '../../commons/utils/logger';
import { escapeSqlString } from '../../commons/utils/sanitize.utils';
import { projectionStore } from '../stores/projection.store.svelte';
import type { BasemapLayer, BasemapMetadata } from '../types/basemap.types';
import {
  readGeoJSONAsArrow,
  readGeoParquetViaDuckDB
} from '../utils/read-geojson-arrow';

const BASEMAP_METADATA_URL = `${base}/basemaps/all-basemaps-metadata.json`;
const BASEMAP_ATTRIBUTES_URL = `${base}/basemaps/all-basemaps-attributes.parquet`;
const GEOMETRY_BASE_PATH = `${base}/basemaps/geometry/`;
const DEFAULT_BASEMAP_ID = 'world-countries-50m';

interface LoadedBasemap {
  metadata: BasemapMetadata;
  geometryTable: ArrowTable;
  layerTables: SvelteMap<string, ArrowTable>;
}

class BasemapService {
  private _availableBasemaps: BasemapMetadata[] = [];

  private _currentBasemap: LoadedBasemap | null = null;

  private _attributesLoaded = false;

  private _basemapCache = new SvelteMap<string, LoadedBasemap>();

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing basemap service', LogCategory.MAP);
      await this.loadMetadata();

      if (Duck) {
        await this.loadAttributesIntoDuckDB();
      } else {
        logger.warn(
          'DuckDB not available, skipping basemap attributes preloading',
          LogCategory.MAP
        );
      }

      logger.success('Basemap service initialized', LogCategory.MAP, {
        basemapCount: this._availableBasemaps.length
      });
    } catch (error) {
      logger.error(
        'Failed to initialize basemap service',
        LogCategory.MAP,
        error
      );
    }
  }

  private async loadMetadata(): Promise<void> {
    try {
      logger.info('Loading basemap metadata catalog', LogCategory.MAP);
      const response = await fetch(BASEMAP_METADATA_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      this._availableBasemaps = await response.json();
      logger.debug('Basemap metadata loaded', LogCategory.MAP, {
        count: this._availableBasemaps.length
      });
    } catch (error) {
      logger.error('Failed to load basemap metadata', LogCategory.MAP, error);
      throw error;
    }
  }

  private async loadAttributesIntoDuckDB(): Promise<void> {
    if (!Duck || this._attributesLoaded) return;

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

      this._attributesLoaded = true;
      logger.success('Basemap attributes stored in DuckDB', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to load basemap attributes', LogCategory.MAP, error);
      throw error;
    }
  }

  private async fetchGeometryFile(
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

  private async loadGeometryFromParquet(filename: string): Promise<ArrowTable> {
    const start = performance.now();
    logger.debug('Loading basemap geometry', LogCategory.MAP, { filename });

    const { response, isGeoJSON } = await this.fetchGeometryFile(filename);

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

  private async loadBasemapLayers(
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
        const table = await this.loadGeometryFromParquet(layer.file);
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

  private _geometryTablesInDuckDB = new Set<string>();

  async loadGeometryIntoDuckDB(basemapId: string): Promise<string> {
    const tableName = `basemap_geom_${basemapId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    if (this._geometryTablesInDuckDB.has(tableName)) {
      logger.debug('Basemap geometry already in DuckDB', LogCategory.MAP, {
        basemapId,
        tableName
      });
      return tableName;
    }

    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    const start = performance.now();
    logger.info('Loading basemap geometry into DuckDB', LogCategory.MAP, {
      basemapId
    });

    try {
      const { response, isGeoJSON } = await this.fetchGeometryFile(basemapId);

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const geometryFile = new File(
        [blob],
        isGeoJSON ? `${basemapId}.geojson` : `${basemapId}.parquet`,
        { type: 'application/octet-stream' }
      );

      await Duck.register_files([geometryFile]);
      await Duck.read_geofile(geometryFile, { tablename: tableName });

      this._geometryTablesInDuckDB.add(tableName);

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
        { basemapId, error }
      );
      throw error;
    }
  }

  private updateProjectionFromTable(geometryTable: ArrowTable): void {
    if (projectionStore.referenceBbox !== null) {
      logger.debug(
        'Skipping basemap bbox update - user data bbox already set',
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

  async loadBasemap(basemapId: string): Promise<LoadedBasemap | null> {
    if (this._basemapCache.has(basemapId)) {
      logger.debug('Basemap loaded from cache', LogCategory.MAP, { basemapId });
      this._currentBasemap = this._basemapCache.get(basemapId)!;
      this.updateProjectionFromTable(this._currentBasemap.geometryTable);
      return this._currentBasemap;
    }

    const metadata = this._availableBasemaps.find(
      (bm) => bm.file === basemapId
    );

    if (!metadata) {
      logger.error(`Basemap not found: ${basemapId}`, LogCategory.MAP);
      return null;
    }

    try {
      const start = performance.now();
      logger.info('Loading basemap', LogCategory.MAP, { basemapId });

      const geometryTable = await this.loadGeometryFromParquet(metadata.file);
      const layerTables = await this.loadBasemapLayers(metadata.layers);

      this._currentBasemap = {
        metadata,
        geometryTable,
        layerTables
      };

      this._basemapCache.set(basemapId, this._currentBasemap);

      this.updateProjectionFromTable(geometryTable);

      logger.success('Basemap loaded', LogCategory.MAP, {
        basemapId,
        layerCount: metadata.layers.length,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return this._currentBasemap;
    } catch (error) {
      logger.error(
        `Failed to load basemap: ${basemapId}`,
        LogCategory.MAP,
        error
      );
      return null;
    }
  }

  async loadDefaultBasemap(): Promise<LoadedBasemap | null> {
    return this.loadBasemap(DEFAULT_BASEMAP_ID);
  }

  get availableBasemaps(): BasemapMetadata[] {
    return this._availableBasemaps;
  }

  get currentBasemap(): LoadedBasemap | null {
    return this._currentBasemap;
  }

  get currentGeometryTable(): ArrowTable | null {
    return this._currentBasemap?.geometryTable ?? null;
  }

  get currentLayers(): Map<string, ArrowTable> {
    return this._currentBasemap?.layerTables ?? new Map();
  }

  reset(): void {
    this._currentBasemap = null;
  }

  clearCache(): void {
    this._basemapCache.clear();
    logger.debug('Basemap cache cleared', LogCategory.MAP);
  }
}

export const basemapService = new BasemapService();
