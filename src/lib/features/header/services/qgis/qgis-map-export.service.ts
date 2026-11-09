import { strToU8, zipSync } from 'fflate';
import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { Duck, duckDBOrchestrator, initDuckDB } from '$lib/features/duckdb';
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
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { resolveRowScope } from '$lib/features/commons/services/row-scope.service';
import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN
} from '$lib/features/commons/constants/data.constants';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  ALL_PRIMITIVE_FILTERS,
  getPolygonPrimitive,
  getPrimitiveClassification,
  getSymbolPrimitive,
  getTextPrimitive,
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
  getEquatorGeoJSON,
  getGraticuleGeoJSON
} from '$lib/features/map/layers/basemap-graticule';
import { BasemapGraticuleMode } from '$lib/features/commons/constants/visualization.constants';
import {
  resolveLandConfig,
  resolveMetadataLineStyle
} from '$lib/features/map/layers/basemap-style-resolve';
import { isWgs84LikeCrs } from '$lib/features/map/utils/dataset-crs.utils';
import {
  buildBasemapSubLayerId,
  buildVisualizationSubLayerId,
  isPerKeyAuxLayerType,
  mergeLayerOrder,
  resolveBasemapConfigRowId,
  type LayerOrderRow
} from '$lib/features/map/utils/layer-panel-row.utils';
import { layerOrderStore } from '$lib/features/step-toolbar/tools/layers/layer-order.store.svelte';
import {
  buildMapGeoreference,
  describeMapGeoreferenceAvailability,
  resolveMapVectorCrs,
  type MapVectorCrs
} from '$lib/features/step-toolbar/tools/projections';
import { facetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
import { getFacetSlotVariable } from '$lib/features/commons/utils/facet-visualization-updates';
import {
  ExportError,
  resolveDatasetGeometrySource,
  type DatasetGeometrySource
} from '../export.service';
import {
  buildBasemapFillPlan,
  buildBasemapLinePlan,
  buildDensityPlan,
  buildVisualizationLayerPlans,
  withLabelEdits,
  type LabelEditFields,
  type QgisExportNote,
  type QgisLayerPlan,
  type QgisStyleContext
} from './qgis-style';
import { buildQgisProject } from './qgis-project';
import { buildQml, MM_PER_PAGE_UNIT, PT_PER_PAGE_UNIT } from './qml';
import {
  exportMapToJpg,
  type MapExportPlacement
} from '$lib/features/commons/utils/map-export.utils';
import {
  formatGdalAuxXml,
  formatWorldFile
} from '$lib/features/commons/utils/georeference.utils';
import { getExportDimensionsForPage } from '../../export-dimensions.utils';
import { EXPORT_RESOLUTION } from '../../types';
import { getFormatState } from '$lib/features/step-toolbar/tools/format';
import { getLegendState } from '$lib/features/step-toolbar/tools/legend';
import { geoIndicationsState } from '$lib/features/step-toolbar/tools/geo-indications';
import {
  measureMapPage,
  type MeasuredFont,
  type MeasuredMapPage
} from '$lib/features/commons/utils/map-export.utils';
import {
  DistanceUnit,
  ScaleForm
} from '$lib/features/commons/constants/ui.constants';
import type { LayoutFont } from './qgis-layout';
import { hslToHex } from '$lib/features/commons/utils/color-utils';
import {
  buildPageLayoutSpec,
  measuredSizeLegend,
  parseCssColor,
  parseLegendItemId,
  type PageLayoutSpec
} from './qgis-page-layout';
import { cutAtSeam, densifyLines, representativePoint } from './qgis-sql';
import type { ClassValueKind } from './qgis-classes';
import type { QmlSymbol, Rgba } from './qml';
import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import { ANNOTATION_ROLE } from '$lib/features/commons/constants/annotation.constants';
import {
  FillMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getAnnotationsState,
  isPageElementPlaceholder
} from '$lib/features/step-toolbar/tools/annotations';
import { resolveDiscretizationLabel } from '$lib/features/visualization-tab';
import { transformWkb } from './wkb-transform';

const WGS84 = 'EPSG:4326';
const WKB_COLUMN = '__khartis_qgis_wkb';
const GEOMETRY_COLUMN = '__khartis_qgis_geometry';

/** What every layer export of one run shares. */
interface ExportRun {
  crs: MapVectorCrs;
  srs: Pick<GeoPackageLayerExportOptions, 'sourceCrs' | 'customSrs'>;
  usedNames: Set<string>;
  /** Layers that could not be written, by title. */
  failures: string[];
  /** The page as exported, for the print layout and the size legends. */
  page: MeasuredMapPage | null;
}

/**
 * One layer that fails (an invalid geometry GEOS refuses, a CRS DuckDB
 * cannot reach) is left out and reported; the rest of the map still goes.
 */
async function guardLayer<T>(
  run: ExportRun,
  title: string,
  build: () => Promise<T>
): Promise<T | null> {
  try {
    return await build();
  } catch (error) {
    logger.error('QGIS export: layer skipped', LogCategory.EXPORT, {
      title,
      error: error instanceof Error ? error.message : String(error)
    });
    run.failures.push(title);
    return null;
  }
}

interface ExportedLayer {
  /** The Layers panel row that orders this layer on the map. */
  row: LayerOrderRow;
  /** Exported for further work in QGIS, not drawn on the Khartis map. */
  hidden?: boolean;
  /** The legend of the layer in words, for the memo. */
  legend?: string[];
  /** The map of a collection it belongs to. */
  group?: string;
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

function createStyleContext(
  viz: VisualizationConfig,
  temporal: Map<string, TemporalKind>
): QgisStyleContext {
  const formatter = new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 2
  });
  return {
    domain: (primitive, column) => getDomain(viz, primitive, column),
    formatValue: (value) => formatter.format(value),
    missingDataLabel: m.qgis_missing_data(),
    columnKind: (column) => temporal.get(column) ?? 'number',
    locale: getLocale()
  };
}

interface Reprojection {
  sql: (geometry: string) => string;
  /** Applied in JavaScript when DuckDB cannot reach the target CRS. */
  fallback: ((wkb: Uint8Array) => Uint8Array | null) | null;
}

// d3 bends a graticule line along the projection; PROJ needs the vertices.
const GRATICULE_STEP_DEGREES = 1;

function buildReprojection(
  crs: MapVectorCrs,
  sourceCrs: string,
  projectInJs: boolean,
  densify = false
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
  const cut = (geometry: string) => {
    const lonLat = toWgs84(geometry);
    return cutAtSeam(
      densify ? densifyLines(lonLat, GRATICULE_STEP_DEGREES) : lonLat,
      crs.seam
    );
  };
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
  /** Computed attributes, by name; listed in `columns` too. */
  computed?: Record<string, string>;
  reprojection: Reprojection;
}): Promise<{ features: GeoPackageFeatureRow[]; dropped: number }> {
  const { from, geometry, columns, reprojection } = options;
  const computed = options.computed ?? {};
  const quoted = columns.map((column) => `"${escapeIdentifier(column)}"`);
  const inner = [
    ...columns.map((column) =>
      Object.hasOwn(computed, column)
        ? `${computed[column]} AS "${escapeIdentifier(column)}"`
        : `d."${escapeIdentifier(column)}"`
    ),
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
  query: (reprojection: Reprojection) => ReturnType<typeof queryFeatures>,
  densify = false
): ReturnType<typeof queryFeatures> {
  try {
    return await query(buildReprojection(crs, sourceCrs, false, densify));
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
    return query(buildReprojection(crs, sourceCrs, true, densify));
  }
}

/**
 * The centroid layer a catalogue basemap ships, loaded into DuckDB, and the
 * column naming its features; null when the basemap has none.
 */
async function loadCatalogCentroids(
  basemapFile: string
): Promise<{ tableName: string; idColumn: string } | null> {
  const metadata =
    basemapService.currentMetadata?.file === basemapFile
      ? basemapService.currentMetadata
      : basemapService.availableBasemaps.find(
          (item) => item.file === basemapFile
        );
  const layer = metadata?.layers.find(
    (item) => item.type === BasemapLayerType.CENTROID && item.file
  );
  if (!layer?.file) {
    return null;
  }
  const tableName = await basemapService.loadGeometryIntoDuckDB(layer.file);
  const columns = await listTableColumns(tableName);
  const idColumn = [INTERNAL_COLUMN.FEATURE_ID, CANONICAL_ID_COLUMN].find(
    (column) => columns.has(column)
  );
  return idColumn && columns.has('geom') ? { tableName, idColumn } : null;
}

/** Lines or rings in lon/lat the export draws itself (graticule, sphere). */
type GeneratedGeometry =
  | { lines: Array<Array<[number, number]>> }
  | { rings: Array<Array<[number, number]>> };

function generatedWkt(source: GeneratedGeometry): string[] {
  const coordinates = (points: Array<[number, number]>) =>
    points.map(([x, y]) => `${Number(x)} ${Number(y)}`).join(', ');
  return 'lines' in source
    ? source.lines
        .filter((line) => line.length >= 2)
        .map((line) => `LINESTRING (${coordinates(line)})`)
    : source.rings
        .filter((ring) => ring.length >= 4)
        .map((ring) => `POLYGON ((${coordinates(ring)}))`);
}

// The whole sphere, a vertex every degree: cut and projected like the rest,
// it is the sea of the map, the shape d3 fills.
function sphereRing(): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  for (let lon = -180; lon < 180; lon += 1) ring.push([lon, -90]);
  for (let lat = -90; lat < 90; lat += 1) ring.push([180, lat]);
  for (let lon = 180; lon > -180; lon -= 1) ring.push([lon, 90]);
  for (let lat = 90; lat > -90; lat -= 1) ring.push([-180, lat]);
  ring.push(ring[0]);
  return ring;
}

function resolveSeaColor(): string | undefined {
  const sea = basemapLayersStore.layers.find((layer) => layer.id === 'mers');
  return sea?.id === 'mers' && sea.visible ? sea.color : undefined;
}

function lineCoordinates(collection: {
  features: Array<{ geometry: { coordinates: number[][] } }>;
}): Array<Array<[number, number]>> {
  return collection.features.map((feature) =>
    feature.geometry.coordinates.map(
      ([lon, lat]) => [lon, lat] as [number, number]
    )
  );
}

async function listTableColumns(tableName: string): Promise<Set<string>> {
  const rows = (await Duck.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${escapeSqlString(tableName)}'`,
    { format: 'array' }
  )) as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}

type TemporalKind = Exclude<ClassValueKind, 'number'>;

/** The date and date-time columns of a table, which QGIS must read as dates. */
async function listTemporalColumns(
  tableName: string | undefined
): Promise<Map<string, TemporalKind>> {
  if (!tableName) {
    return new Map();
  }
  const rows = (await Duck.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${escapeSqlString(tableName)}'`,
    { format: 'array' }
  )) as Array<{ column_name: string; data_type: string }>;
  return new Map(
    rows.flatMap((row): Array<[string, TemporalKind]> => {
      const type = row.data_type.toUpperCase();
      return type === 'DATE'
        ? [[row.column_name, 'date']]
        : type.startsWith('TIMESTAMP')
          ? [[row.column_name, 'datetime']]
          : [];
    })
  );
}

// GeoPackage dates are ISO text in a DATE or DATETIME column.
function temporalSelect(column: string, kind: TemporalKind): string {
  const field = `d."${escapeIdentifier(column)}"`;
  return kind === 'date'
    ? `strftime(${field}::DATE, '%Y-%m-%d')`
    : `strftime(${field}::TIMESTAMP, '%Y-%m-%dT%H:%M:%S.%gZ')`;
}

async function exportPlanLayer(
  viz: VisualizationConfig,
  plan: QgisLayerPlan,
  title: string,
  run: ExportRun,
  temporal: Map<string, TemporalKind>
): Promise<ExportedLayer | null> {
  const { crs, srs, usedNames } = run;
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
    throw new Error(`No geometry for dataset ${viz.datasetId}`);
  }
  const available = await listTableColumns(source.datasetTableName);
  let from = source.from;
  let layerPlan = plan;
  let computed: Record<string, string> = {};
  if (plan.primitive === PrimitiveFilterType.TEXT) {
    const edits = resolveLabelEdits(viz, source, available);
    if (edits === 'unmatched') {
      plan.notes.push({ code: 'label-edits' });
    } else if (edits) {
      from = `${from} ${edits.join}`;
      computed = edits.computed;
      layerPlan = withLabelEdits(plan, edits.fields);
      if (edits.moved) {
        layerPlan.notes.push({ code: 'label-leaders' });
      }
    }
  }
  const double = layerPlan.doubleSymbols;
  if (double) {
    // One row per feature and variable, so QGIS sorts every symbol by size
    // whatever its variable, as the map does.
    from = `${from} CROSS JOIN (VALUES ('A'), ('B')) AS khartis_roles(role)`;
    computed = {
      ...computed,
      [double.roleField]: 'khartis_roles.role',
      [double.valueField]: `CASE khartis_roles.role WHEN 'A' THEN TRY_CAST(d."${escapeIdentifier(double.primary)}" AS DOUBLE) ELSE TRY_CAST(d."${escapeIdentifier(double.secondary)}" AS DOUBLE) END`
    };
  }
  // Khartis' own columns (`__id`…) mean nothing outside it.
  const columns = [
    ...new Set([
      ...Object.keys(computed),
      ...layerPlan.columns,
      ...source.attributeColumns
    ])
  ].filter(
    (column) =>
      Object.hasOwn(computed, column) ||
      (available.has(column) && !column.startsWith('__'))
  );
  const columnTypes: Record<string, 'DATE' | 'DATETIME'> = {};
  for (const column of columns) {
    const kind = temporal.get(column);
    if (kind && !Object.hasOwn(computed, column)) {
      computed = { ...computed, [column]: temporalSelect(column, kind) };
      columnTypes[column] = kind === 'date' ? 'DATE' : 'DATETIME';
    }
  }
  let geometry = source.geometry;
  if (plan.geometry === 'point') {
    const centroids = source.joined
      ? await loadCatalogCentroids(source.joined.basemap)
      : null;
    if (centroids && source.joined) {
      // The map anchors on the centroids the basemap ships; a feature
      // without one falls back to the point the map computes.
      from = `${from} LEFT JOIN "${escapeIdentifier(centroids.tableName)}" c ON CAST(c."${escapeIdentifier(centroids.idColumn)}" AS VARCHAR) = CAST(g."${escapeIdentifier(source.joined.joinColumn)}" AS VARCHAR)`;
      geometry = `COALESCE(c.geom::GEOMETRY, ${representativePoint(geometry)})`;
    } else {
      geometry = representativePoint(geometry);
    }
  }
  const { features, dropped } = await queryWithReprojection(
    crs,
    source.sourceCrs,
    (reprojection) =>
      queryFeatures({ from, geometry, columns, computed, reprojection })
  );
  const orderVizId = resolveOrderVizId(viz.id);
  return {
    row: {
      id: buildVisualizationSubLayerId(orderVizId, plan.primitive),
      kind: 'viz-primitive',
      primitive: plan.primitive,
      parentId: orderVizId
    },
    title,
    legend: describeLegend(viz, layerPlan),
    plan: layerPlan,
    dropped,
    options: {
      layerName: uniqueTableName(title, usedNames),
      ...srs,
      propertyColumns: columns,
      columnTypes,
      features,
      style: {
        name: title,
        qml: buildQml(layerPlan.style),
        description: title
      }
    }
  };
}

const LABEL_EDIT_FIELDS: LabelEditFields = {
  primary: 'khartis_etiquette',
  secondary: 'khartis_etiquette_2',
  dx: 'khartis_decalage_x_mm',
  dy: 'khartis_decalage_y_mm'
};

function sqlText(value: string | undefined): string {
  return value === undefined
    ? 'NULL::VARCHAR'
    : `'${escapeSqlString(value)}'::VARCHAR`;
}

function sqlMillimetres(px: number | undefined): string {
  return px === undefined || !Number.isFinite(px)
    ? 'NULL::DOUBLE'
    : `${px * MM_PER_PAGE_UNIT}::DOUBLE`;
}

/**
 * The texts typed and the positions dragged on the map for this
 * visualization, joined by the feature key the map uses (`f:` basemap
 * feature, `r:` dataset row). 'unmatched' when the features carry no key.
 */
function resolveLabelEdits(
  viz: VisualizationConfig,
  source: DatasetGeometrySource,
  available: Set<string>
):
  | {
      join: string;
      computed: Record<string, string>;
      fields: LabelEditFields;
      moved: boolean;
    }
  | 'unmatched'
  | null {
  const layout = labelLayoutStore.layouts[viz.id];
  const keys = layout
    ? [
        ...new Set([
          ...Object.keys(layout.offsets),
          ...Object.keys(layout.texts)
        ])
      ]
    : [];
  const text = getTextPrimitive(viz);
  if (!layout || keys.length === 0 || !text?.labelColumn) {
    return null;
  }
  const keyExpression = source.joined
    ? `'f:' || CAST(g."${escapeIdentifier(source.joined.joinColumn)}" AS VARCHAR)`
    : available.has(INTERNAL_COLUMN.ID)
      ? `'r:' || CAST(d."${INTERNAL_COLUMN.ID}" AS VARCHAR)`
      : null;
  if (!keyExpression) {
    return 'unmatched';
  }
  const rows = keys.map((key) => {
    const texts = layout.texts[key];
    const offset = layout.offsets[key];
    return `(${sqlText(key)}, ${sqlText(texts?.primary)}, ${sqlText(texts?.secondary)}, ${sqlMillimetres(offset?.[0])}, ${sqlMillimetres(offset?.[1])})`;
  });
  const secondaryColumn = text.secondaryLabels?.enabled
    ? text.secondaryLabels.labelColumn
    : undefined;
  const computed: Record<string, string> = {
    [LABEL_EDIT_FIELDS.primary]: `COALESCE(o.primary_text, CAST(d."${escapeIdentifier(text.labelColumn)}" AS VARCHAR))`,
    [LABEL_EDIT_FIELDS.dx]: 'o.dx',
    [LABEL_EDIT_FIELDS.dy]: 'o.dy'
  };
  if (secondaryColumn) {
    computed[LABEL_EDIT_FIELDS.secondary ?? ''] =
      `COALESCE(o.secondary_text, CAST(d."${escapeIdentifier(secondaryColumn)}" AS VARCHAR))`;
  }
  return {
    join: `LEFT JOIN (VALUES ${rows.join(', ')}) AS o(key, primary_text, secondary_text, dx, dy) ON o.key = ${keyExpression}`,
    computed,
    fields: {
      ...LABEL_EDIT_FIELDS,
      secondary: secondaryColumn ? LABEL_EDIT_FIELDS.secondary : undefined
    },
    moved: Object.keys(layout.offsets).length > 0
  };
}

// QGIS draws the nested circles of proportional symbols with the values of
// the Khartis legend.
function withSizeLegend(
  plan: QgisLayerPlan,
  viz: VisualizationConfig,
  page: MeasuredMapPage | null
): QgisLayerPlan {
  const { renderer } = plan.style;
  if (!plan.proportionalSize || renderer.type === 'null') {
    return plan;
  }
  const classes = [viz.id, resolveOrderVizId(viz.id)]
    .map((id) => measuredSizeLegend(page, id, plan.primitive))
    .find((entries) => entries.length > 0);
  if (!classes) {
    return plan;
  }
  // The legend frame carries the title; the circles take its subtitle.
  const item = getLegendState().items.find((entry) => {
    const parsed = parseLegendItemId(entry.id);
    return (
      parsed?.primitive === plan.primitive &&
      [viz.id, resolveOrderVizId(viz.id)].includes(parsed.vizId)
    );
  });
  return {
    ...plan,
    style: {
      ...plan.style,
      renderer: {
        ...renderer,
        sizeLegend: { title: item?.subtitle?.trim() ?? '', classes }
      }
    }
  };
}

async function exportVisualizationLayers(
  viz: VisualizationConfig,
  run: ExportRun,
  facet?: string
): Promise<ExportedLayer[]> {
  const datasetTable = duckDBOrchestrator.getDatasetBySourceFile(
    viz.datasetId
  )?.tableName;
  const temporal = await listTemporalColumns(datasetTable);
  const plans = buildVisualizationLayerPlans(
    viz,
    createStyleContext(viz, temporal),
    viz.primitiveOrder ?? ALL_PRIMITIVE_FILTERS
  ).map((plan) => withSizeLegend(plan, viz, run.page));
  const name = facet ?? viz.name;
  const layers: ExportedLayer[] = [];
  const add = async (
    title: string,
    build: () => Promise<ExportedLayer | null>,
    hidden = false
  ) => {
    const layer = await guardLayer(run, title, build);
    if (layer) {
      layers.push({ ...layer, group: facet, hidden });
    }
  };
  for (const plan of plans) {
    const title = `${name} – ${primitiveTitle(plan.primitive)}`;
    await add(title, () => exportPlanLayer(viz, plan, title, run, temporal));
    if (plan.primitive === PrimitiveFilterType.POLYGON) {
      const density = buildDensityPlan(viz);
      if (density) {
        const densityTitle = `${name} – ${m.qgis_layer_density()}`;
        await add(densityTitle, () =>
          exportDensityLayer(viz, density, densityTitle, run)
        );
      }
    }
  }
  // Without fills, the joined territories would be lost to QGIS: they come
  // along with every attribute, hidden so the map looks the same.
  if (!plans.some((plan) => plan.primitive === PrimitiveFilterType.POLYGON)) {
    const title = `${name} – ${m.qgis_layer_territories()}`;
    await add(
      title,
      () => exportTerritoriesLayer(viz, title, run, temporal),
      true
    );
  }
  return layers;
}

async function exportTerritoriesLayer(
  viz: VisualizationConfig,
  title: string,
  run: ExportRun,
  temporal: Map<string, TemporalKind>
): Promise<ExportedLayer | null> {
  const source = await resolveDatasetGeometrySource(viz.datasetId, null);
  if (!source) {
    return null;
  }
  const [first] = (await Duck.query(
    `SELECT ST_GeometryType(${source.geometry}) AS type FROM ${source.from} WHERE ${source.geometry} IS NOT NULL LIMIT 1`,
    { format: 'array' }
  )) as Array<{ type: string }>;
  if (!first || !String(first.type).toUpperCase().includes('POLYGON')) {
    return null;
  }
  const plan = buildBasemapFillPlan({
    fillColor: '#000000',
    fillOpacity: 0,
    stroke: { color: '#808080', thickness: 0.5, opacity: 100, dotted: false }
  });
  return exportPlanLayer(viz, plan, title, run, temporal);
}

function readWkbColumn(table: ArrowTable): Uint8Array[] {
  const field =
    table.schema.fields.find((candidate) =>
      candidate.metadata.get('ARROW:extension:name')?.startsWith('geoarrow')
    ) ??
    table.schema.fields.find((candidate) =>
      ['geometry', 'geom'].includes(candidate.name)
    );
  const vector = field ? table.getChild(field.name) : null;
  const values: Uint8Array[] = [];
  for (let index = 0; index < (vector?.length ?? 0); index += 1) {
    const value: unknown = vector?.get(index);
    if (value instanceof Uint8Array) {
      values.push(value);
    }
  }
  return values;
}

/**
 * The dots the map draws for a dot-density fill: the same generation (same
 * ratio and seed, served from its cache), so the same dots.
 */
async function exportDensityLayer(
  viz: VisualizationConfig,
  plan: QgisLayerPlan,
  title: string,
  run: ExportRun
): Promise<ExportedLayer | null> {
  const density = viz.density;
  const dataset = duckDBOrchestrator.getDatasetBySourceFile(viz.datasetId);
  const original = datasetsStore.datasets.find(
    (item) => item.id === viz.datasetId || item.sourceFileId === viz.datasetId
  );
  if (!density?.valueColumn || !density.ratio || !dataset?.tableName) {
    return null;
  }
  const seed = density.seed !== undefined ? { seed: density.seed } : undefined;
  let table: ArrowTable | undefined;
  let sourceCrs = WGS84;
  if (original?.geometry) {
    table = await duckDBOrchestrator.generateDotDensityArrowFromGeoTable(
      dataset.tableName,
      density.valueColumn,
      density.ratio,
      seed
    );
    const crs = original.geometry.crs;
    sourceCrs = crs && !isWgs84LikeCrs(crs) ? crs : WGS84;
  } else if (dataset.gpsMode && dataset.gpsColumns && dataset.joinedBasemap) {
    table = await duckDBOrchestrator.generateDotDensityArrowFromGpsJoin(
      dataset.joinedBasemap,
      dataset.tableName,
      density.valueColumn,
      dataset.gpsColumns,
      density.ratio,
      seed
    );
  } else if (dataset.joinedBasemap) {
    table = await duckDBOrchestrator.generateDotDensityArrowFromJoin(
      dataset.joinedBasemap,
      dataset.tableName,
      density.valueColumn,
      density.ratio,
      seed
    );
  }
  if (!table) {
    return null;
  }
  const { crs } = run;
  const target = crs.status === 'map' ? crs.target : WGS84;
  let project: (wkb: Uint8Array) => Uint8Array | null = (wkb) => wkb;
  if (target !== sourceCrs) {
    // The dots are generated in the dataset CRS; points need no cut, the
    // georeferencing projection carries them like the rest of the map.
    if (!isWgs84LikeCrs(sourceCrs) || crs.status !== 'map' || !crs.forward) {
      throw new Error(`Density dots cannot go from ${sourceCrs} to ${target}`);
    }
    const forward = crs.forward;
    project = (wkb) => transformWkb(wkb, forward);
  }
  let dropped = 0;
  const features: GeoPackageFeatureRow[] = [];
  for (const wkb of readWkbColumn(table)) {
    const projected = project(wkb);
    if (projected) {
      features.push({ properties: {}, wkb: projected });
    } else {
      dropped += 1;
    }
  }
  const orderVizId = resolveOrderVizId(viz.id);
  return {
    row: {
      id: buildVisualizationSubLayerId(orderVizId, PrimitiveFilterType.POLYGON),
      kind: 'viz-primitive',
      primitive: PrimitiveFilterType.POLYGON,
      parentId: orderVizId
    },
    title,
    legend: [
      m.qgis_legend_density({
        column: density.valueColumn,
        ratio: new Intl.NumberFormat(getLocale()).format(density.ratio)
      })
    ],
    plan,
    dropped,
    options: {
      layerName: uniqueTableName(title, run.usedNames),
      ...run.srs,
      propertyColumns: [],
      features,
      style: { name: title, qml: buildQml(plan.style), description: title }
    }
  };
}

interface BasemapExport {
  layers: ExportedLayer[];
  /** Visible basemap layers left out, by name. */
  skipped: string[];
  /** The sea is the colour of the canvas, not a layer. */
  seaAsCanvas?: boolean;
}

async function exportBasemapTable(options: {
  row: LayerOrderRow;
  /** A DuckDB table, or lines in lon/lat the map generates itself. */
  tableName: string | GeneratedGeometry;
  /** Graticule lines, which need a vertex every degree. */
  densify?: boolean;
  title: string;
  plan: QgisLayerPlan;
  sourceCrs: string;
  crs: MapVectorCrs;
  srs: Pick<GeoPackageLayerExportOptions, 'sourceCrs' | 'customSrs'>;
  usedNames: Set<string>;
}): Promise<ExportedLayer> {
  const source = options.tableName;
  const available =
    typeof source === 'string'
      ? await listTableColumns(source)
      : new Set<string>();
  const columns = BASEMAP_ATTRIBUTE_COLUMNS.filter((column) =>
    available.has(column)
  );
  const from =
    typeof source === 'string'
      ? `"${escapeIdentifier(source)}" d`
      : `(SELECT ST_GeomFromText(wkt) AS geom FROM (VALUES ${generatedWkt(
          source
        )
          .map((wkt) => `('${wkt}')`)
          .join(', ')}) AS v(wkt)) d`;
  const { features, dropped } = await queryWithReprojection(
    options.crs,
    options.sourceCrs,
    (reprojection) =>
      queryFeatures({
        from,
        geometry: 'd.geom::GEOMETRY',
        columns,
        reprojection
      }),
    options.densify
  );
  return {
    row: options.row,
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
async function exportBasemapLayers(run: ExportRun): Promise<BasemapExport> {
  const { crs, srs, usedNames } = run;
  const result: BasemapExport = { layers: [], skipped: [] };
  const metadata = basemapService.currentMetadata;
  if (!metadata || !basemapStyleStore.referenceBasemapId) {
    return { ...result, seaAsCanvas: true };
  }
  const basemapSourceCrs =
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
    const name = BASEMAP_LAYER_TITLES[config.id]?.() ?? config.id;
    const push = async (
      tableFile: string | GeneratedGeometry,
      title: string,
      plan: QgisLayerPlan | null,
      metadataLayer: BasemapLayer | null = null,
      densify = false
    ) => {
      if (!plan) {
        return;
      }
      const key = metadataLayer
        ? (metadataLayer.file ?? `${metadata.file}:${metadataLayer.type}`)
        : null;
      const row: LayerOrderRow = {
        id:
          key && isPerKeyAuxLayerType(metadataLayer?.type)
            ? buildBasemapSubLayerId(key)
            : resolveBasemapConfigRowId(config.id),
        kind: 'basemap-aux',
        basemapRenderGroup: getBasemapRenderGroup(config.id),
        basemapRenderBelowThematic: config.renderBelowThematic
      };
      const layer = await guardLayer(run, title, async () =>
        exportBasemapTable({
          row,
          tableName:
            typeof tableFile === 'string'
              ? await basemapService.loadGeometryIntoDuckDB(tableFile)
              : tableFile,
          sourceCrs: typeof tableFile === 'string' ? basemapSourceCrs : WGS84,
          title,
          plan,
          crs,
          srs,
          usedNames,
          densify
        })
      );
      if (layer) {
        result.layers.push(layer);
      }
    };

    switch (config.id) {
      case 'terre': {
        const lands = ofType(BasemapLayerType.LAND);
        const sources =
          lands.length > 0 ? lands : [{ layer: null, entry: { style: null } }];
        for (const { layer, entry } of sources) {
          const land = resolveLandConfig(entry, config, presets);
          await push(
            layer?.file ?? metadata.file,
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
            }),
            layer
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
            layer.file,
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
            }),
            layer
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
          const hasLimitLayers = metadata.layers.some(
            (layer) => layer.type === BasemapLayerType.LIMIT
          );
          if (config.id === 'frontieres' && !hasLimitLayers) {
            // Without limit layers the map outlines the reference polygons.
            await push(
              metadata.file,
              `${name} – ${basemapTitle}`,
              buildBasemapFillPlan({
                fillColor: config.color,
                fillOpacity: 0,
                stroke: config
              })
            );
          } else if (config.id === 'rivieres') {
            result.skipped.push(name);
          }
          break;
        }
        for (const { layer, entry } of limits) {
          if (!layer.file) continue;
          const style =
            config.id === 'frontieres'
              ? resolveMetadataLineStyle(entry, config, presets)
              : config;
          await push(
            layer.file,
            `${name} – ${layerTitle(layer, basemapTitle)}`,
            buildBasemapLinePlan(style),
            layer
          );
        }
        break;
      }
      case 'meridiens':
      case 'equateur': {
        // The equator is a graticule mode: it takes the graticule's style.
        const graticule = basemapLayersStore.layers.find(
          (layer) => layer.id === 'meridiens'
        );
        if (!graticule || graticule.id !== 'meridiens') break;
        const plan = buildBasemapLinePlan(graticule);
        if (config.id === 'equateur') {
          await push(
            { lines: lineCoordinates(getEquatorGeoJSON()) },
            name,
            plan,
            null,
            true
          );
          break;
        }
        const geographicLines = ofType(BasemapLayerType.GEOGRAPHIC_LINES);
        if (
          graticule.mode === BasemapGraticuleMode.REMARKABLE &&
          geographicLines.length > 0
        ) {
          for (const { layer } of geographicLines) {
            if (!layer.file) continue;
            await push(
              layer.file,
              `${name} – ${layerTitle(layer, basemapTitle)}`,
              plan,
              layer,
              true
            );
          }
          break;
        }
        const equatorShown = basemapLayersStore.layers.some(
          (layer) => layer.id === 'equateur' && layer.visible
        );
        await push(
          {
            lines: lineCoordinates(
              getGraticuleGeoJSON(
                graticule.spacingDegrees,
                BasemapGraticuleMode.REGULAR,
                equatorShown
              )
            )
          },
          name,
          plan,
          null,
          true
        );
        break;
      }
      case 'mers': {
        if (config.id !== 'mers') break;
        await push(
          { rings: [sphereRing()] },
          name,
          buildBasemapFillPlan({
            fillColor: config.color,
            fillOpacity: config.opacity,
            stroke: null
          })
        );
        const sea = result.layers.find((layer) => layer.title === name);
        if (!sea || sea.options.features.length === 0) {
          // A projection that sends the poles to infinity draws no sphere:
          // the sea stays the colour of the canvas.
          result.skipped.push(
            m.qgis_basemap_sea_color({ color: config.color })
          );
          result.seaAsCanvas = true;
        }
        break;
      }
      default:
        result.skipped.push(name);
    }
  }
  return result;
}

interface ExportedVisualization {
  viz: VisualizationConfig;
  /** The facet title on the page, for a map of a collection. */
  facet?: string;
}

/**
 * What the map draws: the maps of the collection when one is on (not the
 * visualization it was generated from), the active visualizations otherwise.
 */
function resolveExportedVisualizations(): ExportedVisualization[] {
  const facets = facetsStore.enabled ? facetsStore.facetVisualizations : [];
  if (facets.length > 0) {
    const slotPath = facetsStore.primarySlotPath;
    return facets.map((viz) => {
      const variable =
        (slotPath ? getFacetSlotVariable(viz, slotPath) : undefined) ??
        viz.name;
      return { viz, facet: facetsStore.getFacetTitle(variable) ?? variable };
    });
  }
  return visualizationStore.activeVisualizations
    .filter((viz) => viz.enabled !== false)
    .map((viz) => ({ viz }));
}

/**
 * Bottom to top, in the order of the Layers panel: the persisted manual
 * order, rows it has never seen at their default place (`mergeLayerOrder`,
 * the function the map draws with).
 */
function orderLikeTheMap(
  layers: ExportedLayer[],
  vizs: ExportedVisualization[]
): ExportedLayer[] {
  const topToBottom = mergeLayerOrder(
    layers.map((layer) => layer.row),
    layerOrderStore.order,
    vizs.map(({ viz }) => viz.id)
  );
  const rank = new Map(topToBottom.map((id, index) => [id, index]));
  // The sea is the sphere the map is drawn on: under everything.
  const sea = resolveBasemapConfigRowId('mers');
  return layers
    .map((layer, index) => ({ layer, index }))
    .sort(
      (a, b) =>
        Number(b.layer.row.id === sea) - Number(a.layer.row.id === sea) ||
        (rank.get(b.layer.row.id) ?? 0) - (rank.get(a.layer.row.id) ?? 0) ||
        a.index - b.index
    )
    .map(({ layer }) => layer);
}

function resolveOrderVizId(vizId: string): string {
  const baseId = facetsStore.baseVisualizationId;
  return facetsStore.enabled &&
    baseId &&
    (vizId === baseId || facetsStore.generatedVisualizationIds.includes(vizId))
    ? baseId
    : vizId;
}

function rgbaToHex([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function symbolColor(symbol: QmlSymbol): string | null {
  for (const layer of symbol.layers) {
    const color =
      layer.kind === 'line'
        ? layer.stroke.color
        : layer.kind === 'line-pattern'
          ? layer.color
          : layer.kind === 'point-pattern'
            ? layer.marker.color
            : layer.color;
    if (color && color[3] > 0) {
      return rgbaToHex(color);
    }
  }
  return null;
}

/**
 * The legend of a layer in words: variable, method, classes or categories
 * with their colour, the scale of proportional symbols.
 */
function describeLegend(
  viz: VisualizationConfig,
  plan: QgisLayerPlan
): string[] {
  const lines: string[] = [];
  const formatter = new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 2
  });
  const classification = getPrimitiveClassification(viz, plan.primitive);
  if (plan.primitive === PrimitiveFilterType.POLYGON) {
    const polygon = getPolygonPrimitive(viz);
    if (polygon?.fillMode === FillMode.CLASSES && polygon.valueColumn) {
      lines.push(
        m.qgis_legend_classes({
          column: polygon.valueColumn,
          method: resolveDiscretizationLabel(classification)
        })
      );
    } else if (
      polygon?.fillMode === FillMode.CATEGORIES &&
      polygon.categoryColumn
    ) {
      lines.push(m.qgis_legend_categories({ column: polygon.categoryColumn }));
    }
  }
  if (plan.primitive === PrimitiveFilterType.POINT) {
    const symbol = getSymbolPrimitive(viz);
    const column = symbol?.sizeColumn;
    if (symbol?.mode === SymbolMode.PROPORTIONAL && column) {
      const domain = getDomain(viz, PrimitiveFilterType.POINT, column);
      const max = domain
        ? Math.max(Math.abs(domain.min), Math.abs(domain.max))
        : undefined;
      if (max !== undefined) {
        lines.push(
          m.qgis_legend_proportional({
            column,
            value: formatter.format(max),
            diameter: formatter.format(
              2 * (symbol.maxSize ?? 0) * MM_PER_PAGE_UNIT
            )
          })
        );
      }
    }
  }
  const { renderer } = plan.style;
  const entries =
    renderer.type === 'rules'
      ? renderer.rules.map((rule) => ({
          label: rule.label,
          symbol: rule.symbol
        }))
      : renderer.type === 'categories'
        ? renderer.categories
            .filter((category) => category.render)
            .map((category) => ({
              label: category.label,
              symbol: category.symbol
            }))
        : [];
  for (const entry of entries) {
    const color = symbolColor(entry.symbol);
    lines.push(`    ${entry.label}${color ? ` : ${color}` : ''}`);
  }
  return lines;
}

const PAGE_ROLE_TITLES: Record<string, () => string> = {
  [ANNOTATION_ROLE.TITLE]: () => m.qgis_memo_page_title(),
  [ANNOTATION_ROLE.SUBTITLE]: () => m.qgis_memo_page_subtitle(),
  [ANNOTATION_ROLE.SOURCE]: () => m.qgis_memo_page_source(),
  [ANNOTATION_ROLE.BASEMAP_SOURCE]: () => m.qgis_memo_page_basemap_source(),
  [ANNOTATION_ROLE.CREDIT]: () => m.qgis_memo_page_credit(),
  [ANNOTATION_ROLE.SIGNATURE]: () => m.qgis_memo_page_signature(),
  [ANNOTATION_ROLE.NOTE]: () => m.qgis_memo_page_note()
};

function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The texts of the page (title, sources, notes…), which QGIS does not get. */
function describePageTexts(): string[] {
  return getAnnotationsState()
    .items.filter(
      (item) =>
        item.visible !== false &&
        item.type === AnnotationKind.TEXT &&
        typeof item.content === 'string' &&
        !isPageElementPlaceholder(item)
    )
    .flatMap((item) => {
      const text = plainText(String(item.content));
      if (!text) return [];
      const role = item.role ? PAGE_ROLE_TITLES[item.role]?.() : undefined;
      return [`- ${role ?? m.qgis_memo_page_annotation()} : ${text}`];
    });
}

function describeNote(note: QgisExportNote): string {
  switch (note.code) {
    case 'pattern-fill':
      return m.qgis_note_pattern_fill();
    case 'pattern-approximate':
      return m.qgis_note_pattern_approximate();
    case 'missing-pattern':
      return m.qgis_note_missing_pattern();
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
    case 'label-edits':
      return m.qgis_note_label_edits();
    case 'label-leaders':
      return m.qgis_note_label_leaders();
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
  reference: ReferenceImage | null;
  crs: MapVectorCrs;
  layers: ExportedLayer[];
  extraNotes: string[];
  failures: string[];
  /** Page size in millimetres, the one symbol and text sizes are set for. */
  page: { width: number; height: number };
  /** The project carries a print layout of the page. */
  layout: boolean;
}): string {
  const { crs, layers } = options;
  const lines = [
    m.qgis_memo_title(),
    '',
    m.qgis_memo_open({ project: options.project, gpkg: options.gpkg }),
    options.reference
      ? options.reference.georeferenced
        ? m.qgis_memo_image_georeferenced({ image: options.reference.image })
        : m.qgis_memo_image({ image: options.reference.image })
      : m.qgis_memo_image_missing(),
    ...(options.layout ? [m.qgis_memo_layout()] : []),
    ''
  ];
  if (crs.status === 'map') {
    lines.push(m.qgis_memo_crs({ name: crs.crsName, srs: crs.target }));
    if (crs.composite) {
      lines.push(m.qgis_memo_crs_composite());
    }
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
  const pageTexts = describePageTexts();
  if (pageTexts.length > 0) {
    lines.push('', m.qgis_memo_page(), ...pageTexts);
  }
  lines.push('', m.qgis_memo_layers());
  for (const layer of [...layers].reverse()) {
    lines.push(
      m.qgis_memo_layer({
        title: layer.title,
        table: layer.options.layerName,
        count: layer.options.features.length
      }) + (layer.hidden ? ` ${m.qgis_memo_layer_hidden()}` : '')
    );
    if (layer.dropped > 0) {
      lines.push(m.qgis_memo_layer_dropped({ count: layer.dropped }));
    }
    lines.push(...(layer.legend ?? []));
  }
  const notes = new Set<string>();
  for (const layer of layers) {
    for (const note of layer.plan.notes) {
      notes.add(describeNote(note));
    }
  }
  options.extraNotes.forEach((note) => notes.add(note));
  if (options.failures.length > 0) {
    lines.push('', m.qgis_memo_failed());
    options.failures.forEach((title) => lines.push(`- ${title}`));
  }
  lines.push('', m.qgis_memo_not_reproduced());
  for (const note of notes) {
    lines.push(`- ${note}`);
  }
  lines.push('');
  return lines.join('\n');
}

function collectMapNotes(
  crs: MapVectorCrs,
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
  return notes;
}

const PAGE_MEASURE_TIMEOUT_MS = 10_000;
const REFERENCE_IMAGE_TIMEOUT_MS = 30_000;

interface ReferenceImage {
  image: string;
  files: Record<string, Uint8Array>;
  /** Placed by its .aux.xml and world file, shown in the QGIS project. */
  georeferenced: boolean;
}

/**
 * The page as Khartis draws it, layout included, for comparison in QGIS:
 * placed in the map CRS when the map has one. Null when it cannot be drawn,
 * which the memo says; the layers do not depend on it.
 */
async function renderReferenceImage(
  baseName: string,
  format: { width: number; height: number }
): Promise<ReferenceImage | null> {
  try {
    const { width, height } = getExportDimensionsForPage(
      format.width,
      format.height,
      EXPORT_RESOLUTION.QHD_2K
    );
    let placement: MapExportPlacement | undefined;
    // The layers matter more than the picture: a render that never ends
    // (a hidden tab draws no frame) must not hold the export.
    const blob = await Promise.race([
      exportMapToJpg({
        width,
        height,
        onMapPlacement: (value) => (placement = value)
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Reference image timed out')),
          REFERENCE_IMAGE_TIMEOUT_MS
        )
      )
    ]);
    const image = `${baseName}.jpg`;
    const files: Record<string, Uint8Array> = {
      [image]: new Uint8Array(await blob.arrayBuffer())
    };
    const result = placement ? buildMapGeoreference(placement) : null;
    if (result?.status !== 'ok') {
      return { image, files, georeferenced: false };
    }
    const { georeference } = result;
    files[`${image}.aux.xml`] = strToU8(
      formatGdalAuxXml(georeference.srs, georeference.transform)
    );
    files[`${baseName}.jgw`] = strToU8(formatWorldFile(georeference.transform));
    return { image, files, georeferenced: true };
  } catch (error) {
    logger.error('QGIS export: reference image failed', LogCategory.EXPORT, {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

interface BuiltLayout {
  spec: PageLayoutSpec;
  /** The map frame shows exactly the Khartis map frame. */
  georeferenced: boolean;
}

function hexToRgba(hex: string | undefined): Rgba | null {
  const value = hex?.match(/^#?([0-9a-f]{6})$/i)?.[1];
  return value
    ? [
        parseInt(value.slice(0, 2), 16),
        parseInt(value.slice(2, 4), 16),
        parseInt(value.slice(4, 6), 16),
        255
      ]
    : null;
}

function layoutFont(
  font: MeasuredFont | null,
  fallbackSize: number
): LayoutFont {
  return {
    family: font?.family || 'Open Sans',
    sizePt: (font?.size || fallbackSize) * PT_PER_PAGE_UNIT,
    bold: false,
    italic: false,
    color: parseCssColor(font?.color ?? null) ?? [0, 0, 0, 255]
  };
}

// With a size legend, QGIS lists its title, the circles, then one entry per
// category: an untitled one names its expression, and symbols of one colour
// need no entry beside the circles.
function legendNodeOrder(
  plan: QgisLayerPlan,
  channel?: string
): number[] | undefined {
  const { renderer } = plan.style;
  if (renderer.type === 'null' || !renderer.sizeLegend) {
    return undefined;
  }
  const entries =
    renderer.type === 'single'
      ? 0
      : renderer.type === 'rules'
        ? renderer.rules.length
        : renderer.categories.length;
  // A variable with a legend per channel: the size one shows the circles,
  // the colour one the categories.
  const circles = [...(renderer.sizeLegend.title ? [0] : []), 1];
  const categories = Array.from({ length: entries }, (_, index) => index + 2);
  if (channel === 'size') {
    return circles;
  }
  if (channel === 'color' && categories.length > 0) {
    return categories;
  }
  return [...circles, ...(plan.uniqueColor ? [] : categories)];
}

/** The print layout of the page: map frames, texts, legends, indications. */
function buildLayout(
  page: MeasuredMapPage,
  layers: ExportedLayer[],
  crs: MapVectorCrs,
  format: { color: { hue: number; saturation: number; lightness: number } },
  seaAsCanvas: boolean
): BuiltLayout {
  const thematic = layers.filter(
    (layer) => layer.row.kind === 'viz-primitive' && !layer.hidden
  );
  const themes = [
    ...new Set(thematic.flatMap((layer) => (layer.group ? [layer.group] : [])))
  ];
  const georeference =
    page.facets.length === 0 && page.placement && crs.status === 'map'
      ? buildMapGeoreference(page.placement)
      : null;
  const georeferencedExtent =
    georeference?.status === 'ok' && !georeference.georeference.rotated
      ? georeference.georeference.frameExtent
      : null;
  const legendItems = getLegendState().items;
  const legends = page.legends.flatMap((frame) => {
    const parsed = parseLegendItemId(frame.itemId);
    if (!parsed) {
      return [];
    }
    const matching = thematic.filter(
      (layer) =>
        layer.row.kind === 'viz-primitive' &&
        layer.row.parentId === parsed.vizId &&
        layer.row.primitive === parsed.primitive
    );
    // A shared legend of a collection reads the same for every map.
    const firstGroup = matching[0]?.group;
    const item = legendItems.find((entry) => entry.id === frame.itemId);
    return [
      {
        itemId: frame.itemId,
        title: item?.title || item?.name || '',
        font: layoutFont(frame.font, 9),
        titleFont: {
          ...layoutFont(frame.titleFont ?? frame.font, 10),
          bold: true
        },
        tables: matching
          .filter((layer) => layer.group === firstGroup)
          .reverse()
          .map((layer) => ({
            table: layer.options.layerName,
            nodeOrder: legendNodeOrder(layer.plan, parsed.channel)
          }))
      }
    ];
  });
  const { scale, orientation } = geoIndicationsState;
  const spec = buildPageLayoutSpec({
    page,
    name: 'Khartis',
    pageColor: hexToRgba(
      hslToHex(
        format.color.hue,
        format.color.saturation,
        format.color.lightness
      )
    ) ?? [255, 255, 255, 255],
    mapBackground: seaAsCanvas ? hexToRgba(resolveSeaColor()) : null,
    georeferencedExtent,
    // The maps of a collection share one view in Khartis.
    dataExtent: () =>
      computeLayerExtent(thematic.flatMap((layer) => layer.options.features)),
    themes,
    legends,
    scaleBar:
      geoIndicationsState.visible && scale.enabled
        ? {
            form: scale.form === ScaleForm.BOX ? 'box' : 'line',
            unit: scale.units === DistanceUnit.MILES ? 'mi' : 'km',
            distance: scale.distance,
            font: layoutFont(page.scaleBarFont, 8)
          }
        : null,
    northArrow: geoIndicationsState.visible && orientation.enabled,
    textName: (role, index) =>
      (role ? PAGE_ROLE_TITLES[role]?.() : undefined) ??
      `${m.qgis_memo_page_annotation()} ${index + 1}`
  });
  return { spec, georeferenced: georeferencedExtent !== null };
}

/** What the print layout leaves out or draws its own way. */
function describeLayout(
  layout: BuiltLayout | null,
  page: MeasuredMapPage | null
): string[] {
  if (!layout || !page || layout.spec.maps.length === 0) {
    return [m.qgis_note_layout()];
  }
  const notes = [m.qgis_note_layout_legend()];
  if (page.facets.length > 0) {
    notes.push(m.qgis_note_layout_facets());
  } else if (!layout.georeferenced) {
    notes.push(m.qgis_note_layout_extent());
  }
  if (page.otherAnnotations > 0) {
    notes.push(m.qgis_note_layout_shapes({ count: page.otherAnnotations }));
  }
  if (geoIndicationsState.visible && geoIndicationsState.insetMap.enabled) {
    notes.push(m.qgis_note_layout_inset());
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
  const vizs = resolveExportedVisualizations();
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

  const format = getFormatState();
  // Like the image, the layout must not hold the layers: a hidden tab draws
  // no frame and the measure would wait for one.
  const page = await Promise.race([
    measureMapPage(format.width),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), PAGE_MEASURE_TIMEOUT_MS)
    )
  ]).catch((error: unknown) => {
    logger.error('QGIS export: page not measured', LogCategory.EXPORT, {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  });
  const layers: ExportedLayer[] = [];
  const run: ExportRun = {
    crs,
    srs,
    usedNames: new Set<string>(['layer_styles']),
    failures: [],
    page
  };
  const basemap = await exportBasemapLayers(run);
  layers.push(...basemap.layers);
  for (const { viz, facet } of vizs) {
    layers.push(...(await exportVisualizationLayers(viz, run, facet)));
  }
  const filled = orderLikeTheMap(
    layers.filter((layer) => layer.options.features.length > 0),
    vizs
  );
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
  const reference = await renderReferenceImage(baseName, format);
  const seaAsCanvas = basemap.seaAsCanvas === true;
  const layout = page
    ? buildLayout(page, filled, crs, format, seaAsCanvas)
    : null;
  const memo = buildMemo({
    gpkg,
    project,
    reference,
    crs,
    layers: filled,
    extraNotes: [
      ...collectMapNotes(crs, basemap.skipped),
      ...describeLayout(layout, page)
    ],
    failures: run.failures,
    page: {
      width: format.width * MM_PER_PAGE_UNIT,
      height: format.height * MM_PER_PAGE_UNIT
    },
    layout: (layout?.spec.maps.length ?? 0) > 0
  });
  const thematicFeatures = filled
    .filter((layer) => layer.row.kind === 'viz-primitive')
    .flatMap((layer) => layer.options.features);
  const qgs = buildQgisProject({
    title: baseName,
    gpkg,
    crs,
    extent: computeLayerExtent(thematicFeatures),
    background: seaAsCanvas ? resolveSeaColor() : undefined,
    layers: filled.map((layer) => ({
      name: layer.title,
      table: layer.options.layerName,
      geometry: layer.plan.geometry,
      style: layer.plan.style,
      group: layer.group,
      hidden: layer.hidden
    })),
    image:
      reference?.georeferenced && reference.files[reference.image]
        ? { name: m.qgis_layer_reference_image(), file: reference.image }
        : undefined,
    layout: layout?.spec
  });

  downloadFile(
    new Blob(
      [
        zipSync(
          {
            [gpkg]: new Uint8Array(await geoPackage.arrayBuffer()),
            [project]: strToU8(qgs),
            [`${baseName}-memo.txt`]: strToU8(memo),
            ...(reference?.files ?? {})
          },
          { level: 6 }
        )
      ],
      { type: 'application/zip' }
    ),
    `${baseName}-qgis.zip`
  );

  if (run.failures.length > 0) {
    showWarning(
      m.qgis_export_partial_title(),
      m.qgis_export_partial({ layers: run.failures.join(', ') })
    );
  }
}
