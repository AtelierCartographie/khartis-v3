import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { BasemapMetadata, BasemapLayer } from '../types/basemap.types';
import { logger, LogCategory } from '../../commons/utils/logger';
import { Duck } from '../../commons/services/duckdb/duckdb';
import { readGeoArrowParquet } from '../utils/read-geoarrow-parquet';
import { readGeoJSONAsArrow } from '../utils/read-geojson-arrow';
import { SvelteMap } from 'svelte/reactivity';

const BASEMAP_METADATA_URL = '/basemaps/all-basemaps-metadata.json';
const BASEMAP_ATTRIBUTES_URL = '/basemaps/all-basemaps-attributes.parquet';
const GEOMETRY_BASE_PATH = '/basemaps/geometry/';
const DEFAULT_BASEMAP_ID = 'france-region-2025';

interface LoadedBasemap {
  metadata: BasemapMetadata;
  geometryTable: ArrowTable;
  layerTables: SvelteMap<string, ArrowTable>;
}

class BasemapService {
  private _availableBasemaps: BasemapMetadata[] = [];

  private _currentBasemap: LoadedBasemap | null = null;

  private _attributesLoaded = false;

  async initialize(): Promise<void> {
    try {
      await this.loadMetadata();

      if (Duck) {
        await this.loadAttributesIntoDuckDB();
      } else {
        logger.warn(
          'DuckDB not ready, skipping attributes loading',
          LogCategory.MAP
        );
      }

      logger.info(
        'Basemap service initialized without loading default basemap',
        LogCategory.MAP
      );
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
      logger.info('Loading basemap metadata', LogCategory.MAP);
      const response = await fetch(BASEMAP_METADATA_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      this._availableBasemaps = await response.json();
      logger.success(
        `Loaded metadata for ${this._availableBasemaps.length} basemaps`,
        LogCategory.MAP
      );
    } catch (error) {
      logger.error('Failed to load basemap metadata', LogCategory.MAP, error);
      throw error;
    }
  }

  private async loadAttributesIntoDuckDB(): Promise<void> {
    if (!Duck || this._attributesLoaded) return;

    try {
      logger.info('Loading basemap attributes into DuckDB', LogCategory.MAP);
      const response = await fetch(BASEMAP_ATTRIBUTES_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch attributes: ${response.statusText}`);
      }

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

      const result = await Duck.query(`
        CREATE OR REPLACE TABLE basemap_attributes AS
        SELECT * FROM parquet_scan('${fileId}')
      `);

      if (!result) {
        throw new Error('Failed to create basemap_attributes table');
      }

      this._attributesLoaded = true;
      logger.success('Basemap attributes loaded into DuckDB', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to load basemap attributes', LogCategory.MAP, error);
      throw error;
    }
  }

  private async loadGeometryFromParquet(filename: string): Promise<ArrowTable> {
    let url = `${GEOMETRY_BASE_PATH}${filename}.parquet`;
    logger.info(`Loading geometry from ${url}`, LogCategory.MAP);

    let response = await fetch(url);
    let isGeoJSON = false;

    if (!response.ok) {
      url = `${GEOMETRY_BASE_PATH}${filename}.geojson`;
      logger.info(`Parquet not found, trying GeoJSON: ${url}`, LogCategory.MAP);
      response = await fetch(url);
      isGeoJSON = true;

      if (!response.ok) {
        throw new Error(`Failed to fetch geometry: ${response.statusText}`);
      }
    }

    let jsTable: ArrowTable;

    if (isGeoJSON) {
      const geojsonText = await response.text();
      jsTable = await readGeoJSONAsArrow(geojsonText, `basemap_${filename}`);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      jsTable = await readGeoArrowParquet(arrayBuffer);
    }

    logger.info(
      `Loaded ${jsTable.numRows} features from ${filename}`,
      LogCategory.MAP
    );
    return jsTable;
  }

  private async loadBasemapLayers(
    layers: BasemapLayer[]
  ): Promise<SvelteMap<string, ArrowTable>> {
    const layerTables = new SvelteMap<string, ArrowTable>();

    for (const layer of layers) {
      try {
        const table = await this.loadGeometryFromParquet(layer.file);
        layerTables.set(layer.file, table);
        logger.info(`Loaded layer: ${layer.title}`, LogCategory.MAP);
      } catch (error) {
        logger.warn(
          `Failed to load layer ${layer.title}`,
          LogCategory.MAP,
          error
        );
      }
    }

    return layerTables;
  }

  async loadBasemap(basemapId: string): Promise<LoadedBasemap | null> {
    const metadata = this._availableBasemaps.find(
      (bm) => bm.file === basemapId
    );

    if (!metadata) {
      logger.error(`Basemap not found: ${basemapId}`, LogCategory.MAP);
      return null;
    }

    try {
      logger.info(`Loading basemap: ${metadata.title}`, LogCategory.MAP);

      const geometryTable = await this.loadGeometryFromParquet(metadata.file);
      const layerTables = await this.loadBasemapLayers(metadata.layers);

      this._currentBasemap = {
        metadata,
        geometryTable,
        layerTables
      };

      logger.success(`Basemap loaded: ${metadata.title}`, LogCategory.MAP);
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
}

export const basemapService = new BasemapService();
