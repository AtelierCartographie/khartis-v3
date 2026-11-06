import { strToU8, zipSync } from 'fflate';
import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import {
  downloadFile,
  generateExportFilename
} from '$lib/features/commons/utils/file-export.utils';
import {
  computeLayerExtent,
  exportGeoPackageLayers,
  type GeoPackageFeatureRow,
  type GeoPackageLayerExportOptions
} from '$lib/features/commons/utils/geopackage-export.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { resolveRowScope } from '$lib/features/commons/services/row-scope.service';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  ALL_PRIMITIVE_FILTERS,
  PrimitiveFilterType,
  visualizationStore,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  basemapAuxLayersStore,
  basemapLayersStore,
  basemapService,
  getBasemapRenderGroup,
  labelLayoutStore,
  rowScopeStore
} from '$lib/features/map';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapLayer } from '$lib/features/map/types/basemap.types';
import { BASEMAP_WATER_FILL_OPACITY_RATIO } from '$lib/features/map/layers/basemap-layers';
import {
  resolveLandConfig,
  resolveMetadataLineStyle
} from '$lib/features/map/layers/basemap-style-resolve';
import { isWgs84LikeCrs } from '$lib/features/map/utils/dataset-crs.utils';
import {
  describeMapGeoreferenceAvailability,
  resolveMapVectorCrs,
  type MapVectorCrs
} from '$lib/features/step-toolbar/tools/projections';
import { facetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
import { ExportError, resolveDatasetGeometrySource } from '../export.service';
import {
  buildBasemapFillPlan,
  buildBasemapLinePlan,
  buildVisualizationLayerPlans,
  type QgisExportNote,
  type QgisLayerPlan,
  type QgisStyleContext
} from './qgis-style';
import { buildQgisProject } from './qgis-project';
import { buildQml, MM_PER_CSS_PX } from './qml';
import { getFormatState } from '$lib/features/step-toolbar/tools/format';
import { cutAtOppositeMeridian, representativePoint } from './qgis-sql';
import { transformWkb } from './wkb-transform';

const WGS84 = 'EPSG:4326';
const WKB_COLUMN = '__khartis_qgis_wkb';
const GEOMETRY_COLUMN = '__khartis_qgis_geometry';

interface ExportedLayer {
  options: GeoPackageLayerExportOptions;
  title: string;
  plan: QgisLayerPlan;
  dropped: number;
}

const TABLE_NAME_MAX_LENGTH = 40;

function uniqueTableName(base: string, used: Set<string>): string {
  const root = (slug(base) || 'couche').slice(0, TABLE_NAME_MAX_LENGTH);
  let candidate = root;
  for (let index = 2; used.has(candidate); index += 1) {
    candidate = `${root}_${index}`;
  }
  used.add(candidate);
  return candidate;
}

function primitiveTitle(primitive: PrimitiveFilter): string {
  switch (primitive) {
    case PrimitiveFilterType.POLYGON:
      return m.qgis_layer_polygons();
    case PrimitiveFilterType.LINE:
      return m.qgis_layer_lines();
    case PrimitiveFilterType.POINT:
      return m.qgis_layer_symbols();
    case PrimitiveFilterType.TEXT:
      return m.qgis_layer_labels();
  }
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function getDomain(
  viz: VisualizationConfig,
  primitive: PrimitiveFilter,
  column: string
): { min: number; max: number } | null {
  const scoped = rowScopeStore.getScopedDomain(viz.id, primitive, column);
  if (scoped) {
    return scoped;
  }
  const stats = datasetsStore.getColumnStatistics(viz.datasetId, column);
  const min = stats && 'min' in stats ? Number(stats.min) : NaN;
  const max = stats && 'max' in stats ? Number(stats.max) : NaN;
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function createStyleContext(viz: VisualizationConfig): QgisStyleContext {
  const formatter = new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 2
  });
  return {
    domain: (primitive, column) => getDomain(viz, primitive, column),
    formatValue: (value) => formatter.format(value),
    missingDataLabel: m.qgis_missing_data()
  };
}

interface Reprojection {
  sql: (geometry: string) => string;
  /** Applied in JavaScript when DuckDB cannot reach the target CRS. */
  fallback: ((wkb: Uint8Array) => Uint8Array | null) | null;
}

function buildReprojection(
  crs: MapVectorCrs,
  sourceCrs: string,
  projectInJs: boolean
): Reprojection {
  const target = crs.status === 'map' ? crs.target : WGS84;
  const sourceIsLonLat = isWgs84LikeCrs(sourceCrs);
  if (!projectInJs && sourceCrs === target) {
    return { sql: (geometry) => geometry, fallback: null };
  }
  const toWgs84 = (geometry: string) =>
    sourceIsLonLat
      ? geometry
      : `ST_Transform(${geometry}, '${escapeSqlString(sourceCrs)}', '${WGS84}', true)`;
  if (crs.status !== 'map') {
    return { sql: toWgs84, fallback: null };
  }
  const cut = (geometry: string) =>
    cutAtOppositeMeridian(toWgs84(geometry), crs.centralMeridian);
  if (projectInJs) {
    const forward = crs.forward;
    return {
      sql: cut,
      fallback: forward ? (wkb) => transformWkb(wkb, forward) : null
    };
  }
  return {
    sql: (geometry) =>
      `ST_Transform(${cut(geometry)}, '${WGS84}', '${escapeSqlString(target)}', true)`,
    fallback: null
  };
}

async function queryFeatures(options: {
  from: string;
  geometry: string;
  columns: string[];
  reprojection: Reprojection;
}): Promise<{ features: GeoPackageFeatureRow[]; dropped: number }> {
  const { from, geometry, columns, reprojection } = options;
  const quoted = columns.map((column) => `"${escapeIdentifier(column)}"`);
  const inner = [
    ...columns.map((column) => `d."${escapeIdentifier(column)}"`),
    `${geometry} AS ${GEOMETRY_COLUMN}`
  ];
  const rows = (await Duck.query(
    `SELECT ${[...quoted, `ST_AsWKB(${reprojection.sql(GEOMETRY_COLUMN)}) AS "${WKB_COLUMN}"`].join(', ')}
     FROM (SELECT ${inner.join(', ')} FROM ${from}) s
     WHERE ${GEOMETRY_COLUMN} IS NOT NULL`,
    { format: 'array' }
  )) as Record<string, unknown>[];

  let dropped = 0;
  const features: GeoPackageFeatureRow[] = [];
  for (const row of rows) {
    const raw = row[WKB_COLUMN];
    let wkb = raw instanceof Uint8Array ? raw : null;
    if (wkb && reprojection.fallback) {
      wkb = reprojection.fallback(wkb);
    }
    if (!wkb || !hasFiniteCoordinates(wkb)) {
      dropped += 1;
      continue;
    }
    const properties: Record<string, unknown> = {};
    for (const column of columns) {
      properties[column] = row[column];
    }
    features.push({ properties, wkb });
  }
  return { features, dropped };
}

function hasFiniteCoordinates(wkb: Uint8Array): boolean {
  return transformWkb(wkb, (point) => point) !== null;
}

async function queryWithReprojection(
  crs: MapVectorCrs,
  sourceCrs: string,
  query: (reprojection: Reprojection) => ReturnType<typeof queryFeatures>
): ReturnType<typeof queryFeatures> {
  try {
    return await query(buildReprojection(crs, sourceCrs, false));
  } catch (error) {
    if (crs.status !== 'map' || !crs.forward) {
      throw error;
    }
    // DuckDB WASM refuses some PROJ strings as a target: project in
    // JavaScript with the function that georeferences the image.
    logger.warn(
      'ST_Transform to the map CRS failed, projecting in JS',
      LogCategory.EXPORT,
      {
        target: crs.target,
        error: error instanceof Error ? error.message : String(error)
      }
    );
    return query(buildReprojection(crs, sourceCrs, true));
  }
}

async function listTableColumns(tableName: string): Promise<Set<string>> {
  const rows = (await Duck.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${escapeSqlString(tableName)}'`,
    { format: 'array' }
  )) as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}

async function exportVisualizationLayers(
  viz: VisualizationConfig,
  crs: MapVectorCrs,
  srs: Pick<GeoPackageLayerExportOptions, 'sourceCrs' | 'customSrs'>,
  usedNames: Set<string>
): Promise<ExportedLayer[]> {
  const plans = buildVisualizationLayerPlans(
    viz,
    createStyleContext(viz),
    viz.primitiveOrder ?? ALL_PRIMITIVE_FILTERS
  );
  const layers: ExportedLayer[] = [];
  for (const plan of plans) {
    const scope = resolveRowScope({
      datasetId: viz.datasetId,
      vizFilters: viz.dataFilters,
      primitive: plan.primitive
    });
    const source = await resolveDatasetGeometrySource(
      viz.datasetId,
      scope?.clause ?? null
    );
    if (!source) {
      continue;
    }
    const available = await listTableColumns(source.datasetTableName);
    // Khartis' own columns (`__id`…) mean nothing outside it.
    const columns = [
      ...new Set([...plan.columns, ...source.attributeColumns])
    ].filter((column) => available.has(column) && !column.startsWith('__'));
    const geometry =
      plan.geometry === 'point'
        ? representativePoint(source.geometry)
        : source.geometry;
    const { features, dropped } = await queryWithReprojection(
      crs,
      source.sourceCrs,
      (reprojection) =>
        queryFeatures({ from: source.from, geometry, columns, reprojection })
    );
    const title = `${viz.name} – ${primitiveTitle(plan.primitive)}`;
    layers.push({
      title,
      plan,
      dropped,
      options: {
        layerName: uniqueTableName(
          `${viz.name}_${primitiveTitle(plan.primitive)}`,
          usedNames
        ),
        ...srs,
        propertyColumns: columns,
        features,
        style: { name: title, qml: buildQml(plan.style), description: title }
      }
    });
  }
  return layers;
}

interface BasemapExport {
  /** The background group, bottom first: land, lakes. */
  background: ExportedLayer[];
  /** Foreground layers set under the thematic layers. */
  below: ExportedLayer[];
  above: ExportedLayer[];
  /** Visible basemap layers left out, by name. */
  skipped: string[];
}

async function exportBasemapTable(options: {
  tableName: string;
  title: string;
  plan: QgisLayerPlan;
  sourceCrs: string;
  crs: MapVectorCrs;
  srs: Pick<GeoPackageLayerExportOptions, 'sourceCrs' | 'customSrs'>;
  usedNames: Set<string>;
}): Promise<ExportedLayer> {
  const available = await listTableColumns(options.tableName);
  const columns = BASEMAP_ATTRIBUTE_COLUMNS.filter((column) =>
    available.has(column)
  );
  const { features, dropped } = await queryWithReprojection(
    options.crs,
    options.sourceCrs,
    (reprojection) =>
      queryFeatures({
        from: `"${escapeIdentifier(options.tableName)}" d`,
        geometry: 'd.geom::GEOMETRY',
        columns,
        reprojection
      })
  );
  return {
    title: options.title,
    plan: options.plan,
    dropped,
    options: {
      layerName: uniqueTableName(options.title, options.usedNames),
      ...options.srs,
      propertyColumns: columns,
      features,
      style: {
        name: options.title,
        qml: buildQml(options.plan.style),
        description: options.title
      }
    }
  };
}

const BASEMAP_ATTRIBUTE_COLUMNS = [
  'id',
  'name',
  'nom',
  'name_fr',
  'name_en',
  'code'
];

/**
 * The basemap layers the map draws from geometry (land, lakes, borders,
 * rivers), styled as the basemap panel and the catalogue presets set them.
 */
async function exportBasemapLayers(
  crs: MapVectorCrs,
  srs: Pick<GeoPackageLayerExportOptions, 'sourceCrs' | 'customSrs'>,
  usedNames: Set<string>
): Promise<BasemapExport> {
  const result: BasemapExport = {
    background: [],
    below: [],
    above: [],
    skipped: []
  };
  const metadata = basemapService.currentMetadata;
  if (!metadata || !basemapStyleStore.referenceBasemapId) {
    return result;
  }
  const sourceCrs =
    metadata.proj_source && !isWgs84LikeCrs(metadata.proj_source)
      ? metadata.proj_source
      : WGS84;
  const presets = basemapService.stylePresets;
  const basemapTitle =
    getLocale() === 'fr' ? metadata.title_fr : metadata.title_en;
  const visibleEntries = metadata.layers
    .map((layer) => ({
      layer,
      key: layer.file ?? `${metadata.file}:${layer.type}`
    }))
    .filter(({ key }) =>
      basemapAuxLayersStore.isVisible(metadata.file, key, true)
    )
    .map(({ layer, key }) => ({
      layer,
      entry: {
        style: layer.style ?? null,
        styleOverride: basemapAuxLayersStore.getStyle(metadata.file, key)
      }
    }));
  const ofType = (type: BasemapLayerType) =>
    visibleEntries.filter(({ layer }) => layer.type === type);
  const layerTitle = (layer: BasemapLayer, fallback: string) =>
    (getLocale() === 'fr' ? layer.title_fr : layer.title_en) ?? fallback;

  // The store lists the panel top first.
  for (const config of [...basemapLayersStore.layers].reverse()) {
    if (!config.visible) continue;
    const target =
      getBasemapRenderGroup(config.id) === 'background'
        ? result.background
        : config.renderBelowThematic
          ? result.below
          : result.above;
    const name = BASEMAP_LAYER_TITLES[config.id]?.() ?? config.id;
    const push = async (
      tableName: string,
      title: string,
      plan: QgisLayerPlan | null
    ) => {
      if (plan) {
        target.push(
          await exportBasemapTable({
            tableName,
            title,
            plan,
            sourceCrs,
            crs,
            srs,
            usedNames
          })
        );
      }
    };

    switch (config.id) {
      case 'terre': {
        const lands = ofType(BasemapLayerType.LAND);
        const sources =
          lands.length > 0 ? lands : [{ layer: null, entry: { style: null } }];
        for (const { layer, entry } of sources) {
          const land = resolveLandConfig(entry, config, presets);
          const tableName = await basemapService.loadGeometryIntoDuckDB(
            layer?.file ?? metadata.file
          );
          await push(
            tableName,
            `${name} – ${layer ? layerTitle(layer, basemapTitle) : basemapTitle}`,
            buildBasemapFillPlan({
              fillColor: land.fillColor,
              fillOpacity: land.fillOpacity,
              stroke: land.strokeVisible
                ? {
                    color: land.strokeColor,
                    thickness: land.strokeThickness,
                    opacity: land.strokeOpacity,
                    dotted: land.strokeDotted,
                    dottedPattern: land.strokeDottedPattern
                  }
                : null
            })
          );
        }
        if (config.fillShadow) {
          result.skipped.push(m.qgis_basemap_land_shadow());
        }
        break;
      }
      case 'lacs': {
        for (const { layer } of ofType(BasemapLayerType.POLYGON)) {
          if (!layer.file) continue;
          await push(
            await basemapService.loadGeometryIntoDuckDB(layer.file),
            `${name} – ${layerTitle(layer, basemapTitle)}`,
            buildBasemapFillPlan({
              fillColor: config.color,
              fillOpacity: config.opacity * BASEMAP_WATER_FILL_OPACITY_RATIO,
              stroke: {
                color: config.color,
                thickness: config.thickness,
                opacity: config.opacity,
                dotted: false
              }
            })
          );
        }
        break;
      }
      case 'frontieres':
      case 'rivieres': {
        const limits = ofType(
          config.id === 'frontieres'
            ? BasemapLayerType.LIMIT
            : BasemapLayerType.LINE
        );
        if (limits.length === 0) {
          // Borders derived from the polygons are not written: QGIS can
          // draw them from the land layer outlines.
          result.skipped.push(name);
          break;
        }
        for (const { layer, entry } of limits) {
          if (!layer.file) continue;
          const style =
            config.id === 'frontieres'
              ? resolveMetadataLineStyle(entry, config, presets)
              : config;
          await push(
            await basemapService.loadGeometryIntoDuckDB(layer.file),
            `${name} – ${layerTitle(layer, basemapTitle)}`,
            buildBasemapLinePlan(style)
          );
        }
        break;
      }
      default:
        result.skipped.push(name);
    }
  }
  return result;
}

function describeNote(note: QgisExportNote): string {
  switch (note.code) {
    case 'pattern-fill':
      return m.qgis_note_pattern_fill();
    case 'missing-pattern':
      return m.qgis_note_missing_pattern();
    case 'density':
      return m.qgis_note_density();
    case 'double-symbols':
      return m.qgis_note_double_symbols({ column: note.detail ?? '' });
    case 'symbol-shapes':
      return m.qgis_note_symbol_shapes();
    case 'knockout':
      return m.qgis_note_knockout();
    case 'label-placement':
      return m.qgis_note_label_placement();
    case 'font':
      return m.qgis_note_font({ font: note.detail ?? '' });
  }
}

const BASEMAP_LAYER_TITLES: Record<string, () => string> = {
  terre: () => m.qgis_basemap_land(),
  mers: () => m.qgis_basemap_sea(),
  lacs: () => m.qgis_basemap_lakes(),
  rivieres: () => m.qgis_basemap_rivers(),
  relief: () => m.qgis_basemap_relief(),
  equateur: () => m.qgis_basemap_equator(),
  meridiens: () => m.qgis_basemap_graticule(),
  frontieres: () => m.qgis_basemap_borders(),
  villes: () => m.qgis_basemap_cities(),
  sphere: () => m.qgis_basemap_sphere()
};

function buildMemo(options: {
  gpkg: string;
  project: string;
  crs: MapVectorCrs;
  layers: ExportedLayer[];
  extraNotes: string[];
  /** Page size in millimetres, the one symbol and text sizes are set for. */
  page: { width: number; height: number };
}): string {
  const { crs, layers } = options;
  const lines = [
    m.qgis_memo_title(),
    '',
    m.qgis_memo_open({ project: options.project, gpkg: options.gpkg }),
    ''
  ];
  if (crs.status === 'map') {
    lines.push(m.qgis_memo_crs({ name: crs.crsName, srs: crs.target }));
    if (crs.definition.notes.includes('spherical')) {
      lines.push(m.projection_definition_note_spherical());
    }
  } else {
    lines.push(
      m.qgis_memo_crs_wgs84({
        reason: describeMapGeoreferenceAvailability({
          available: false,
          reason: crs.reason
        })
      })
    );
  }
  lines.push(
    m.qgis_memo_sizes({
      width: Math.round(options.page.width),
      height: Math.round(options.page.height)
    })
  );
  lines.push('', m.qgis_memo_layers());
  for (const layer of [...layers].reverse()) {
    lines.push(
      m.qgis_memo_layer({
        title: layer.title,
        table: layer.options.layerName,
        count: layer.options.features.length
      })
    );
    if (layer.dropped > 0) {
      lines.push(m.qgis_memo_layer_dropped({ count: layer.dropped }));
    }
  }
  const notes = new Set<string>();
  for (const layer of layers) {
    for (const note of layer.plan.notes) {
      notes.add(describeNote(note));
    }
  }
  options.extraNotes.forEach((note) => notes.add(note));
  lines.push('', m.qgis_memo_not_reproduced());
  for (const note of notes) {
    lines.push(`- ${note}`);
  }
  lines.push(`- ${m.qgis_note_layout()}`, '');
  return lines.join('\n');
}

function collectMapNotes(
  crs: MapVectorCrs,
  vizs: VisualizationConfig[],
  skippedBasemapLayers: string[]
): string[] {
  const notes: string[] = [];
  if (crs.status === 'map' && crs.definition.notes.includes('rotated')) {
    notes.push(m.qgis_note_rotated());
  }
  if (facetsStore.enabled) {
    notes.push(m.qgis_note_facets());
  }
  if (skippedBasemapLayers.length > 0) {
    notes.push(
      m.qgis_note_basemap_layers({ layers: skippedBasemapLayers.join(', ') })
    );
  }
  const editedLabels = vizs.some((viz) => {
    const layout = labelLayoutStore.layouts[viz.id];
    return (
      layout &&
      (Object.keys(layout.offsets).length > 0 ||
        Object.keys(layout.texts).length > 0)
    );
  });
  if (editedLabels) {
    notes.push(m.qgis_note_label_edits());
  }
  return notes;
}

/**
 * Exports the map as a GeoPackage QGIS opens styled: one layer per
 * primitive of each visualization, plus the basemap land, in the map CRS,
 * with a QGIS project giving their order and a memo of what is left out.
 */
export async function exportMapAsQgisGeoPackage(
  fileName: string
): Promise<void> {
  const vizs = visualizationStore.activeVisualizations.filter(
    (viz) => viz.enabled !== false
  );
  if (vizs.length === 0) {
    throw new ExportError(m.export_map_error(), m.export_map_no_data());
  }
  await initDuckDB();
  if (!Duck.db) {
    throw new DuckDBError(m.error_duckdb_not_initialized());
  }

  const crs = resolveMapVectorCrs();
  const srs: Pick<GeoPackageLayerExportOptions, 'sourceCrs' | 'customSrs'> =
    crs.status !== 'map'
      ? { sourceCrs: WGS84 }
      : 'epsg' in crs.geoPackageSrs
        ? { sourceCrs: `EPSG:${crs.geoPackageSrs.epsg}` }
        : { sourceCrs: null, customSrs: crs.geoPackageSrs };

  // Bottom to top: the land under the thematic layers.
  const layers: ExportedLayer[] = [];
  const usedNames = new Set<string>(['layer_styles']);
  const basemap = await exportBasemapLayers(crs, srs, usedNames);
  layers.push(...basemap.background, ...basemap.below);
  for (const viz of vizs) {
    layers.push(...(await exportVisualizationLayers(viz, crs, srs, usedNames)));
  }
  layers.push(...basemap.above);
  const filled = layers.filter((layer) => layer.options.features.length > 0);
  if (filled.length === 0) {
    throw new ExportError(
      m.export_map_error(),
      m.error_no_geometric_data_export()
    );
  }

  const gpkg = generateExportFilename(fileName, 'gpkg');
  const baseName = gpkg.replace(/\.gpkg$/, '');
  const project = `${baseName}.qgs`;
  const geoPackage = await exportGeoPackageLayers(
    filled.map((layer) => layer.options)
  );
  const format = getFormatState();
  const memo = buildMemo({
    gpkg,
    project,
    crs,
    layers: filled,
    extraNotes: collectMapNotes(crs, vizs, basemap.skipped),
    page: {
      width: format.width * MM_PER_CSS_PX,
      height: format.height * MM_PER_CSS_PX
    }
  });
  const thematicFeatures = filled
    .filter(
      (layer) =>
        !basemap.background.includes(layer) &&
        !basemap.below.includes(layer) &&
        !basemap.above.includes(layer)
    )
    .flatMap((layer) => layer.options.features);
  const qgs = buildQgisProject({
    title: baseName,
    gpkg,
    crs,
    extent: computeLayerExtent(thematicFeatures),
    layers: filled.map((layer) => ({
      name: layer.title,
      table: layer.options.layerName,
      geometry: layer.plan.geometry,
      style: layer.plan.style
    }))
  });

  downloadFile(
    new Blob(
      [
        zipSync(
          {
            [gpkg]: new Uint8Array(await geoPackage.arrayBuffer()),
            [project]: strToU8(qgs),
            [`${baseName}-memo.txt`]: strToU8(memo)
          },
          { level: 6 }
        )
      ],
      { type: 'application/zip' }
    ),
    `${baseName}-qgis.zip`
  );
}
