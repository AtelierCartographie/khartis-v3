import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import * as m from '$lib/paraglide/messages';
import type { Table as ArrowTable } from 'apache-arrow';
import { convertGeoPackageToGeoJsonFile } from '$lib/features/map/utils/geopackage-browser-fallback.utils';
import { normalizeProj4CrsCode } from '$lib/features/commons/utils/proj4-crs.utils';
import { DUCK_CONST, EXTENSIONS, SQL_FUNCTIONS } from '../constants';
import { executeQuery } from '../core/query';
import { isProjectionSupported } from './reprojection';
import type {
  DuckDBContext,
  DuckDBMetadata,
  FileWithId,
  ReadGeofileOptions
} from '../types';
import { generateUniqueTableName, registerFiles } from './file-registry';
import { addRowId } from './reader-utils';

interface GeofileMetadata {
  crs: string | null;
  geometryColumn: string;
  layerCount: number;
  selectedLayer: string | null;
  autoSelectedLayer: boolean;
}

function isThreadPoolError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('thread constructor failed') ||
    message.includes('resource temporarily unavailable') ||
    message.includes('pthread_create')
  );
}

function isGeoPackageFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.gpkg');
}

function shouldUseGeoPackageBrowserFallback(
  ctx: DuckDBContext,
  geofile: File,
  meta: boolean,
  shapefile: boolean
): boolean {
  return (
    !meta &&
    !shapefile &&
    isGeoPackageFile(geofile.name) &&
    typeof window !== 'undefined' &&
    !ctx.threadsSupported
  );
}

function isCrsNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && /crs not found/i.test(error.message.toLowerCase())
  );
}

/**
 * `ST_Read` can still fail with "crs not found" while materialising the GEOMETRY
 * type for some source CRS, even though PROJ is bundled and `ST_Transform`
 * resolves most EPSG codes. `keep_wkb` skips that resolution (raw WKB); we then
 * re-tag the geometry with the detected source CRS via a plain type cast
 * (metadata only), so a later `ST_Transform` (or proj4 fallback) can reproject
 * it to WGS84 when the render path actually needs it.
 */
function buildCrsTaggedReadQuery(
  escapedFinalTable: string,
  escapedGeoFileId: string,
  selectedLayerClause: string,
  sourceCrs: string
): string {
  return `CREATE OR REPLACE TABLE "${escapedFinalTable}" AS
    SELECT * EXCLUDE ("${INTERNAL_COLUMN.WKB_GEOMETRY}"),
      ST_GeomFromWKB("${INTERNAL_COLUMN.WKB_GEOMETRY}")::GEOMETRY('${escapeSqlString(
        sourceCrs
      )}') AS "${INTERNAL_COLUMN.GEOM}"
    FROM ST_Read('${escapedGeoFileId}', keep_wkb := true${selectedLayerClause});`;
}

async function runGeofileRead(
  ctx: DuckDBContext,
  readQuery: string
): Promise<void> {
  await executeQuery(ctx.connection, readQuery, {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  });
}

interface GeofileLayerMetadata {
  layerIndex: number;
  layerName: string | null;
  featureCount: number;
  geometryType: string | null;
  geometryColumn: string | null;
  crs: string | null;
}

function getGeometryPriority(geometryType: string | null): number {
  const normalized = geometryType?.toLowerCase() ?? '';

  if (normalized.includes('polygon')) return 0;
  if (normalized.includes('line')) return 1;
  if (normalized.includes('point')) return 2;

  return 3;
}

function selectPreferredGeofileLayer(
  layers: GeofileLayerMetadata[]
): GeofileLayerMetadata | null {
  const spatialLayers = layers.filter(
    (layer) => layer.layerName && layer.geometryColumn && layer.geometryType
  );

  if (spatialLayers.length === 0) {
    return null;
  }

  return [...spatialLayers].sort((left, right) => {
    const priorityDiff =
      getGeometryPriority(left.geometryType) -
      getGeometryPriority(right.geometryType);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    if (left.featureCount !== right.featureCount) {
      return right.featureCount - left.featureCount;
    }

    return left.layerIndex - right.layerIndex;
  })[0];
}

async function ensureSpatialExtension(ctx: DuckDBContext): Promise<void> {
  if (ctx.extensionsLoaded.spatial) return;

  try {
    await executeQuery(ctx.connection, `LOAD ${EXTENSIONS.SPATIAL};`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    ctx.extensionsLoaded.spatial = true;
  } catch (loadError) {
    logger.error(
      'Failed to load spatial extension, trying install fallback',
      LogCategory.DUCKDB,
      loadError
    );
    try {
      await executeQuery(
        ctx.connection,
        `INSTALL ${EXTENSIONS.SPATIAL}; LOAD ${EXTENSIONS.SPATIAL};`,
        {
          format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
        }
      );
      ctx.extensionsLoaded.spatial = true;
    } catch (error) {
      logger.error(
        'Failed to load spatial extension',
        LogCategory.DUCKDB,
        error
      );
      throw error;
    }
  }
}

async function detectGeofileMetadata(
  ctx: DuckDBContext,
  fileId: string,
  requestedLayer?: string
): Promise<GeofileMetadata> {
  const defaultResult: GeofileMetadata = {
    crs: null,
    geometryColumn: INTERNAL_COLUMN.GEOM,
    layerCount: 1,
    selectedLayer: requestedLayer ?? null,
    autoSelectedLayer: false
  };
  try {
    await ensureSpatialExtension(ctx);

    const escapedFileId = escapeSqlString(fileId);
    const layers = (await executeQuery(
      ctx.connection,
      `SELECT
         row_number() OVER () AS layer_index,
         layer.name AS layer_name,
         layer.feature_count AS feature_count,
         layer.geometry_fields[1].crs.auth_code AS crs_code,
         layer.geometry_fields[1].name AS geom_name,
         layer.geometry_fields[1].type AS geom_type
       FROM (
         SELECT unnest(layers) AS layer
         FROM ST_Read_Meta('${escapedFileId}')
       )`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{
      layer_index?: number | bigint;
      layer_name?: string | null;
      feature_count?: number | bigint | null;
      crs_code?: number | bigint | string | null;
      geom_name?: string | null;
      geom_type?: string | null;
    }>;

    if (layers.length > 0) {
      const parsedLayers = layers.map((layer) => {
        const crsCode = layer.crs_code;
        let crs: string | null = null;
        if (crsCode) {
          if (typeof crsCode === 'number') {
            crs = `EPSG:${crsCode}`;
          } else if (typeof crsCode === 'string') {
            crs = crsCode.includes('EPSG') ? crsCode : `EPSG:${crsCode}`;
          } else if (typeof crsCode === 'bigint') {
            crs = `EPSG:${crsCode}`;
          }
        }

        return {
          layerIndex:
            typeof layer.layer_index === 'bigint'
              ? Number(layer.layer_index)
              : Number(layer.layer_index ?? 0),
          layerName: layer.layer_name ?? null,
          featureCount:
            typeof layer.feature_count === 'bigint'
              ? Number(layer.feature_count)
              : Number(layer.feature_count ?? 0),
          geometryType: layer.geom_type ?? null,
          geometryColumn: layer.geom_name ?? null,
          crs
        } satisfies GeofileLayerMetadata;
      });
      const matchingRequestedLayer =
        requestedLayer == null
          ? null
          : (parsedLayers.find((layer) => layer.layerName === requestedLayer) ??
            null);
      const selectedLayer =
        matchingRequestedLayer ?? selectPreferredGeofileLayer(parsedLayers);

      if (selectedLayer) {
        return {
          crs: selectedLayer.crs,
          geometryColumn: selectedLayer.geometryColumn ?? INTERNAL_COLUMN.GEOM,
          layerCount: parsedLayers.length,
          selectedLayer: selectedLayer.layerName,
          autoSelectedLayer:
            matchingRequestedLayer == null && parsedLayers.length > 1
        };
      }
    }

    const result = (await executeQuery(
      ctx.connection,
      `SELECT
         layers[1].geometry_fields[1].crs.auth_code AS crs_code,
         layers[1].geometry_fields[1].name AS geom_name,
         len(layers) AS layer_count
       FROM ST_Read_Meta('${escapedFileId}')`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_TABLE }
    )) as ArrowTable;
    if (result && result.numRows > 0) {
      const crsCode = result.getChild('crs_code')?.get(0);
      const geomName = result.getChild('geom_name')?.get(0);
      const layerCount = Number(result.getChild('layer_count')?.get(0) ?? 1);
      let crs: string | null = null;
      if (crsCode) {
        if (typeof crsCode === 'number') {
          crs = `EPSG:${crsCode}`;
        } else if (typeof crsCode === 'string') {
          crs = crsCode.includes('EPSG') ? crsCode : `EPSG:${crsCode}`;
        } else if (typeof crsCode === 'bigint') {
          crs = `EPSG:${crsCode}`;
        }
      }
      return {
        crs,
        geometryColumn:
          geomName && typeof geomName === 'string'
            ? geomName
            : INTERNAL_COLUMN.GEOM,
        layerCount,
        selectedLayer: requestedLayer ?? null,
        autoSelectedLayer: false
      };
    }
    return defaultResult;
  } catch {
    return defaultResult;
  }
}

export async function readGeofile(
  ctx: DuckDBContext,
  geofile: File,
  options: ReadGeofileOptions = {}
): Promise<DuckDBMetadata | string> {
  let { tablename } = options;
  const meta = options.meta ?? false;
  const shapefile = options.shapefile ?? false;
  const requestedLayer = options.layer;
  let usedGeoPackageBrowserFallback = false;

  await registerFiles(ctx.db, ctx.registered_files, [geofile], { shapefile });
  const geofileWithId = geofile as FileWithId;

  if (meta) {
    const escapedFileIdMeta = escapeSqlString(geofileWithId.id);
    const result = await executeQuery(
      ctx.connection,
      `FROM ${SQL_FUNCTIONS.ST_READ_META}('${escapedFileIdMeta}')
				SELECT
					file_name AS name,
					driver_short_name AS format,
					layers[1].feature_count AS nb_entities,
					layers[1].geometry_fields[1].type AS geometry,
					layers[1].geometry_fields[1].crs.name AS crs`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_TABLE }
    );
    return result as DuckDBMetadata;
  }

  if (!tablename) {
    tablename = generateUniqueTableName(geofile.name, ctx.loaded_files);
  }

  if (shouldUseGeoPackageBrowserFallback(ctx, geofile, meta, shapefile)) {
    const fallbackGeoJsonFile = await convertGeoPackageToGeoJsonFile(geofile, {
      preferredLayer: requestedLayer ?? undefined
    });

    await readGeofile(ctx, fallbackGeoJsonFile, {
      ...options,
      tablename,
      layer: undefined
    });

    ctx.loaded_files.set(tablename, geofile.name);
    return tablename;
  }

  const geoMeta = await detectGeofileMetadata(
    ctx,
    geofileWithId.id,
    requestedLayer
  );

  const finalTablename = tablename;
  const escapedFinalTable = escapeIdentifier(finalTablename);
  const escapedGeoFileId = escapeSqlString(geofileWithId.id);
  const selectedLayerClause = geoMeta.selectedLayer
    ? `, layer = '${escapeSqlString(geoMeta.selectedLayer)}'`
    : '';
  const readQuery = `CREATE OR REPLACE TABLE "${escapedFinalTable}" AS FROM ST_Read('${escapedGeoFileId}'${selectedLayerClause});`;

  try {
    await runGeofileRead(ctx, readQuery);
  } catch (error) {
    const sourceCrs = geoMeta.crs ? normalizeProj4CrsCode(geoMeta.crs) : null;

    if (
      isCrsNotFoundError(error) &&
      sourceCrs &&
      isProjectionSupported(sourceCrs)
    ) {
      await runGeofileRead(
        ctx,
        buildCrsTaggedReadQuery(
          escapedFinalTable,
          escapedGeoFileId,
          selectedLayerClause,
          sourceCrs
        )
      );
    } else if (isGeoPackageFile(geofile.name) && isThreadPoolError(error)) {
      const fallbackGeoJsonFile = await convertGeoPackageToGeoJsonFile(
        geofile,
        {
          preferredLayer: geoMeta.selectedLayer ?? undefined
        }
      );

      usedGeoPackageBrowserFallback = true;
      await readGeofile(ctx, fallbackGeoJsonFile, {
        ...options,
        tablename: finalTablename,
        layer: undefined
      });
    } else {
      throw error;
    }
  }

  if (!tablename) {
    throw new DuckDBError(m.error_unable_determine_table());
  }

  if (!usedGeoPackageBrowserFallback) {
    await addRowId(ctx.connection, finalTablename);
  }

  ctx.loaded_files.set(tablename, geofile.name);
  return tablename;
}
