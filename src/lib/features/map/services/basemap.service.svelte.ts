import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { BasemapMetadata, BasemapLayer } from '../types/basemap.types';
import { logger, LogCategory } from '../../commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
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

      const result = await Duck.query(`
        CREATE OR REPLACE TABLE basemap_attributes AS
        SELECT * FROM parquet_scan('${fileId}')
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

  private async loadGeometryFromParquet(filename: string): Promise<ArrowTable> {
    const start = performance.now();
    logger.debug('Loading basemap geometry', LogCategory.MAP, { filename });
    let url = `${GEOMETRY_BASE_PATH}${filename}.parquet`;

    let response = await fetch(url);
    let isGeoJSON = false;

    if (!response.ok) {
      url = `${GEOMETRY_BASE_PATH}${filename}.geojson`;
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

  async loadBasemap(basemapId: string): Promise<LoadedBasemap | null> {
    const metadata = this._availableBasemaps.find(
      (bm) => bm.file === basemapId
    );

    if (!metadata) {
      logger.error(`Basemap not found: ${basemapId}`, LogCategory.MAP);
      return null;
    }

    try {
      logger.info('Loading basemap', LogCategory.MAP, { basemapId });

      const geometryTable = await this.loadGeometryFromParquet(metadata.file);
      const layerTables = await this.loadBasemapLayers(metadata.layers);

      this._currentBasemap = {
        metadata,
        geometryTable,
        layerTables
      };

      logger.success('Basemap loaded', LogCategory.MAP, {
        basemapId,
        layerCount: metadata.layers.length
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
}

export const basemapService = new BasemapService();
