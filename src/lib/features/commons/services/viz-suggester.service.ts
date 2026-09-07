import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_TYPE
} from '$lib/features/commons/constants/data.constants';

import {
  detectSemioType,
  SEMIO_TYPES,
  toStatNumber,
  type SemioType
} from '$lib/features/commons/utils/semio-detector.utils';
import type { ColumnAnalysis } from '$lib/features/data-pipeline';
import { DuckDBSimplifiedType } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';

export type GeometryType =
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon';

export const SIMPLIFIED_GEOMETRY_TYPE = {
  POINT: 'point',
  LINE: 'line',
  POLYGON: 'polygon'
} as const;

export type SimplifiedGeometryType =
  (typeof SIMPLIFIED_GEOMETRY_TYPE)[keyof typeof SIMPLIFIED_GEOMETRY_TYPE];
export type { SemioType };

export interface VizSuggestion {
  id: string;
  label: string;
  nbColumns: number;
  semioTypes: SemioType[];
  geometries: SimplifiedGeometryType[];
  columns?: string[];
  score?: number;
  dataGeometry?: SimplifiedGeometryType;
}

export interface EnrichedColumn extends ColumnAnalysis {
  name: string;
  type: string;
  semioType: SemioType;
  score: number;
  isSuggestionCandidate: boolean;
}

export { SEMIO_TYPES };

const VIZ_CRITERIA: readonly VizSuggestion[] = [
  {
    id: 'symbols_uniques',
    get label() {
      return m.viz_suggestion_symbols_uniques();
    },
    nbColumns: 0,
    semioTypes: [],
    geometries: ['point', 'polygon']
  },
  {
    id: 'polygons_colorful_QL',
    get label() {
      return m.viz_suggestion_polygons_colorful_ql();
    },
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['polygon']
  },
  {
    id: 'choropleth',
    get label() {
      return m.viz_suggestion_choropleth();
    },
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['polygon']
  },
  {
    id: 'choropleth_labeled',
    get label() {
      return m.viz_suggestion_choropleth_labeled();
    },
    nbColumns: 2,
    semioTypes: ['QTR', 'label'],
    geometries: ['polygon']
  },
  {
    id: 'symbols_uniques_colorful_QTR',
    get label() {
      return m.viz_suggestion_symbols_unique_colorful_qtr();
    },
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_differents',
    get label() {
      return m.viz_suggestion_symbols_different_ql();
    },
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_uniques_colorful_QL',
    get label() {
      return m.viz_suggestion_symbols_unique_colorful_ql();
    },
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional',
    get label() {
      return m.viz_suggestion_symbols_proportional();
    },
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_labeled',
    get label() {
      return m.viz_suggestion_symbols_proportional_labeled();
    },
    nbColumns: 2,
    semioTypes: ['QTA', 'label'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_colorful_QL',
    get label() {
      return m.viz_suggestion_symbols_proportional_colorful_ql();
    },
    nbColumns: 2,
    semioTypes: ['QTA', 'QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_colorful_QTR',
    get label() {
      return m.viz_suggestion_symbols_proportional_colorful_qtr();
    },
    nbColumns: 2,
    semioTypes: ['QTA', 'QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_double',
    get label() {
      return m.viz_suggestion_symbols_proportional_double();
    },
    nbColumns: 2,
    semioTypes: ['QTA', 'QTA'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'polygons_uniques',
    get label() {
      return m.viz_suggestion_polygons_unique();
    },
    nbColumns: 0,
    semioTypes: [],
    geometries: ['polygon']
  },
  {
    id: 'lines_uniques',
    get label() {
      return m.viz_suggestion_lines_unique();
    },
    nbColumns: 0,
    semioTypes: [],
    geometries: ['line']
  },
  {
    id: 'lines_colorful_QL',
    get label() {
      return m.viz_suggestion_lines_colorful_ql();
    },
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['line']
  },
  {
    id: 'lines_colorful_QTR',
    get label() {
      return m.viz_suggestion_lines_colorful_qtr();
    },
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional',
    get label() {
      return m.viz_suggestion_lines_proportional();
    },
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional_colorful_QL',
    get label() {
      return m.viz_suggestion_lines_proportional_colorful_ql();
    },
    nbColumns: 2,
    semioTypes: ['QTA', 'QL'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional_colorful_QTR',
    get label() {
      return m.viz_suggestion_lines_proportional_colorful_qtr();
    },
    nbColumns: 2,
    semioTypes: ['QTA', 'QTR'],
    geometries: ['line']
  },
  {
    id: 'polygons_colorful_QLO',
    get label() {
      return m.viz_suggestion_polygons_colorful_qlo();
    },
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['polygon']
  },
  {
    id: 'symbols_differents_QLO',
    get label() {
      return m.viz_suggestion_symbols_different_qlo();
    },
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_uniques_colorful_QLO',
    get label() {
      return m.viz_suggestion_symbols_unique_colorful_qlo();
    },
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'lines_colorful_QLO',
    get label() {
      return m.viz_suggestion_lines_colorful_qlo();
    },
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['line']
  },
  {
    id: 'texts_colorful_QL',
    get label() {
      return m.viz_suggestion_texts_colorful_ql();
    },
    nbColumns: 2,
    semioTypes: ['QL', 'QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'texts_colorful_QTR',
    get label() {
      return m.viz_suggestion_texts_colorful_qtr();
    },
    nbColumns: 2,
    semioTypes: ['QL', 'QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'texts_proportional',
    get label() {
      return m.viz_suggestion_texts_proportional();
    },
    nbColumns: 2,
    semioTypes: ['QL', 'QTA'],
    geometries: ['point', 'polygon']
  }
] as const;

const COLUMN_TYPE = {
  NUMBER: 'number',
  INTEGER: 'integer',
  BIGINT: 'bigint',
  DATE: 'date',
  STRING: 'string',
  TEXT: 'text',
  BOOLEAN: 'boolean'
} as const;

const NUMERIC_COLUMN_TYPES = [
  COLUMN_TYPE.NUMBER,
  COLUMN_TYPE.INTEGER,
  COLUMN_TYPE.BIGINT
] as const;

const MAX_TEXT_POINT_FEATURES = 150;
const MAX_CATEGORY_COLOR_CLASSES = 8;
const MAX_CATEGORY_SHAPE_CLASSES = 5;
const MAX_CATEGORY_SHARE_UNIQUES = 0.5;
const MIN_THEMATIC_SEMIO_SCORE = 0.3;
const COMFORT_CATEGORY_COLOR_CLASSES = 6;
const COMFORT_CATEGORY_SHAPE_CLASSES = 4;
const CROWDED_CATEGORY_PENALTY = 0.85;
const FLAT_PROPORTIONAL_RATIO = 2;
const FLAT_PROPORTIONAL_PENALTY = 0.6;
const TEXT_SUGGESTION_SCORE_FACTOR = 0.7;
const LABELED_SCORE_FACTOR = 0.9;
const LABELED_PROPORTIONAL_VIZ_ID = 'symbols_proportional_labeled';
const LABELED_CHOROPLETH_VIZ_ID = 'choropleth_labeled';
const SHAPE_CATEGORY_VIZ_IDS = new Set([
  'symbols_differents',
  'symbols_differents_QLO'
]);

export function simplifyGeometryType(
  geomType: GeometryType
): SimplifiedGeometryType {
  if (geomType.includes('Point')) return 'point';
  if (geomType.includes('Line')) return 'line';
  if (geomType.includes('Polygon')) return 'polygon';
  return 'polygon';
}

function mapTypeToSimple(columnType: string): DuckDBSimplifiedType {
  if (
    NUMERIC_COLUMN_TYPES.includes(
      columnType as (typeof NUMERIC_COLUMN_TYPES)[number]
    )
  ) {
    return DuckDBSimplifiedType.NUMERIC;
  }
  if (columnType === COLUMN_TYPE.DATE) {
    return DuckDBSimplifiedType.DATE;
  }
  return DuckDBSimplifiedType.STRING;
}

function getTotalCount(column: ColumnAnalysis): number {
  const stats = column.stats;
  if (!stats) return 0;
  if (typeof stats.totalCount === 'number') return stats.totalCount;
  if (typeof stats.count === 'number') return stats.count;
  return 0;
}

function getUniqueCount(column: ColumnAnalysis): number {
  const stats = column.stats;
  if (!stats) return 0;
  if (typeof stats.uniqueCount === 'number') return stats.uniqueCount;
  if (typeof stats.uniques === 'number') return stats.uniques;
  return 0;
}

function getNullCount(column: ColumnAnalysis): number {
  const stats = column.stats;
  if (!stats) return 0;
  if (typeof stats.nullCount === 'number') return stats.nullCount;
  if (typeof stats.nulls === 'number') return stats.nulls;
  return 0;
}

function isGeometryColumn(column: ColumnAnalysis): boolean {
  const columnType = String(column.type ?? '').toLowerCase();

  return (
    columnType === COLUMN_TYPE_GEOMETRY ||
    columnType.includes(COLUMN_TYPE_GEOMETRY) ||
    column.geometryInfo != null
  );
}

function resolveGeoSemioType(column: ColumnAnalysis): SemioType | null {
  switch (column.geo_type) {
    case GEO_COLUMN_TYPE.LATITUDE:
      return SEMIO_TYPES.GEOLAT;
    case GEO_COLUMN_TYPE.LONGITUDE:
      return SEMIO_TYPES.GEOLON;
    default:
      return null;
  }
}

function getColumnSemioType(column: ColumnAnalysis): EnrichedColumn {
  const columnName = column.name ?? '';
  const columnType = (column.type ?? 'string').toString();
  const geoSemioType = resolveGeoSemioType(column);
  const suggestionCandidate = !isGeometryColumn(column) && !geoSemioType;

  const analysisLike = {
    name: columnName,
    type_simple: mapTypeToSimple(columnType),
    count: getTotalCount(column),
    uniques: getUniqueCount(column),
    nulls: getNullCount(column),
    min: toStatNumber(column.stats?.min),
    max: toStatNumber(column.stats?.max),
    share_integers: column.stats?.share_integers,
    share_floats: column.stats?.share_floats,
    share_rank_interval: column.stats?.share_rank_interval,
    extent_magnitude: column.stats?.extent_magnitude,
    skewness: column.stats?.skewness,
    categories: column.stats?.categories
  };

  const { semioType, semioScore } = geoSemioType
    ? { semioType: geoSemioType, semioScore: 1 }
    : detectSemioType(analysisLike);

  return {
    ...column,
    name: columnName || '(column)',
    type: columnType,
    semioType,
    score: semioScore,
    isSuggestionCandidate: suggestionCandidate
  };
}

function computeSuggestionScore(
  columns: EnrichedColumn[],
  legibilityFactor = 1
): number {
  if (columns.length === 0) return 0;
  const totalScore = columns.reduce((sum, col) => sum + col.score, 0);
  const avgScore = totalScore / columns.length;
  return Math.round(Math.min(avgScore, 1) * legibilityFactor * 100);
}

function computeLegibilityFactor(
  viz: VizSuggestion,
  columns: EnrichedColumn[]
): number {
  let factor = 1;

  for (const column of columns) {
    if (isCategoricalColumn(column)) {
      const comfortLimit = SHAPE_CATEGORY_VIZ_IDS.has(viz.id)
        ? COMFORT_CATEGORY_SHAPE_CLASSES
        : COMFORT_CATEGORY_COLOR_CLASSES;
      if (getUniqueCount(column) > comfortLimit) {
        factor *= CROWDED_CATEGORY_PENALTY;
      }
    }

    if (column.semioType === SEMIO_TYPES.QTA) {
      const min = toStatNumber(column.stats?.min);
      const max = toStatNumber(column.stats?.max);
      if (
        min !== undefined &&
        max !== undefined &&
        min > 0 &&
        max / min < FLAT_PROPORTIONAL_RATIO
      ) {
        factor *= FLAT_PROPORTIONAL_PENALTY;
      }
    }
  }

  return factor;
}

function getShareUniques(column: EnrichedColumn): number {
  const totalCount = getTotalCount(column);
  if (totalCount <= 0) return 0;
  return getUniqueCount(column) / totalCount;
}

function findLabelCandidate(
  columns: EnrichedColumn[]
): EnrichedColumn | undefined {
  return columns
    .filter((column) => column.semioType === SEMIO_TYPES.LABEL)
    .sort((a, b) => b.score - a.score)[0];
}

function findBestThematicColumn(
  columns: EnrichedColumn[],
  semioType: SemioType
): EnrichedColumn | undefined {
  return columns
    .filter((column) => column.semioType === semioType)
    .filter((column) => column.score >= MIN_THEMATIC_SEMIO_SCORE)
    .sort((a, b) => b.score - a.score)[0];
}

function buildLabeledSuggestion(
  vizId: string,
  thematic: EnrichedColumn,
  labelCandidate: EnrichedColumn
): VizSuggestion | undefined {
  const criteria = VIZ_CRITERIA.find((entry) => entry.id === vizId);
  if (!criteria) return undefined;

  return {
    ...criteria,
    columns: [thematic.name, labelCandidate.name],
    score: computeSuggestionScore(
      [thematic],
      computeLegibilityFactor(criteria, [thematic]) * LABELED_SCORE_FACTOR
    )
  };
}

function generateLabeledSuggestions(
  columns: EnrichedColumn[],
  geometryType: SimplifiedGeometryType
): VizSuggestion[] {
  if (geometryType === SIMPLIFIED_GEOMETRY_TYPE.LINE) {
    return [];
  }

  const labelCandidate = findLabelCandidate(columns);
  if (!labelCandidate) {
    return [];
  }

  const results: VizSuggestion[] = [];

  const bestAbsolute = findBestThematicColumn(columns, SEMIO_TYPES.QTA);
  if (bestAbsolute) {
    const suggestion = buildLabeledSuggestion(
      LABELED_PROPORTIONAL_VIZ_ID,
      bestAbsolute,
      labelCandidate
    );
    if (suggestion) results.push(suggestion);
  }

  if (geometryType === SIMPLIFIED_GEOMETRY_TYPE.POLYGON) {
    const bestRatio = findBestThematicColumn(columns, SEMIO_TYPES.QTR);
    if (bestRatio) {
      const suggestion = buildLabeledSuggestion(
        LABELED_CHOROPLETH_VIZ_ID,
        bestRatio,
        labelCandidate
      );
      if (suggestion) results.push(suggestion);
    }
  }

  return results;
}

function generateTextSuggestions(
  columns: EnrichedColumn[],
  geometryType: SimplifiedGeometryType
): VizSuggestion[] {
  if (geometryType === SIMPLIFIED_GEOMETRY_TYPE.LINE) {
    return [];
  }

  const totalFeatures = Math.max(
    ...columns.map((column) => getTotalCount(column)),
    0
  );
  if (
    geometryType === SIMPLIFIED_GEOMETRY_TYPE.POINT &&
    totalFeatures > MAX_TEXT_POINT_FEATURES
  ) {
    return [];
  }

  const labelCandidate = findLabelCandidate(columns);

  if (!labelCandidate) {
    return [];
  }

  const thematicCandidates = columns.filter((column) => {
    if (column.name === labelCandidate.name) return false;
    if (column.semioType === SEMIO_TYPES.GEOID) return false;
    if (column.score < MIN_THEMATIC_SEMIO_SCORE) return false;
    if (
      column.semioType === SEMIO_TYPES.QL ||
      column.semioType === SEMIO_TYPES.QLO
    ) {
      return getUniqueCount(column) <= MAX_CATEGORY_COLOR_CLASSES;
    }
    return (
      column.semioType === SEMIO_TYPES.QTR ||
      column.semioType === SEMIO_TYPES.QTA
    );
  });

  const bestQualitative = thematicCandidates.find(
    (column) =>
      column.semioType === SEMIO_TYPES.QL ||
      column.semioType === SEMIO_TYPES.QLO
  );
  const bestRatio = thematicCandidates.find(
    (column) => column.semioType === SEMIO_TYPES.QTR
  );

  const results: VizSuggestion[] = [];

  if (bestQualitative) {
    const viz = VIZ_CRITERIA.find((entry) => entry.id === 'texts_colorful_QL');
    if (viz) {
      results.push({
        ...viz,
        columns: [labelCandidate.name, bestQualitative.name],
        score: computeSuggestionScore(
          [bestQualitative],
          computeLegibilityFactor(viz, [labelCandidate, bestQualitative]) *
            TEXT_SUGGESTION_SCORE_FACTOR
        )
      });
    }
  }

  if (bestRatio) {
    const viz = VIZ_CRITERIA.find((entry) => entry.id === 'texts_colorful_QTR');
    if (viz) {
      results.push({
        ...viz,
        columns: [labelCandidate.name, bestRatio.name],
        score: computeSuggestionScore(
          [bestRatio],
          computeLegibilityFactor(viz, [labelCandidate, bestRatio]) *
            TEXT_SUGGESTION_SCORE_FACTOR
        )
      });
    }
  }

  return results;
}

function isCategoricalColumn(column: EnrichedColumn): boolean {
  return (
    column.semioType === SEMIO_TYPES.QL || column.semioType === SEMIO_TYPES.QLO
  );
}

function fitsCategoricalLegibility(
  viz: VizSuggestion,
  columns: EnrichedColumn[]
): boolean {
  const maxCategories = SHAPE_CATEGORY_VIZ_IDS.has(viz.id)
    ? MAX_CATEGORY_SHAPE_CLASSES
    : MAX_CATEGORY_COLOR_CLASSES;

  return columns
    .filter(isCategoricalColumn)
    .every(
      (column) =>
        getUniqueCount(column) <= maxCategories &&
        getShareUniques(column) <= MAX_CATEGORY_SHARE_UNIQUES
    );
}

function searchVizByType(
  dataset: EnrichedColumn | EnrichedColumn[],
  geometryType: SimplifiedGeometryType,
  nbColumns: 1 | 2
): VizSuggestion[] {
  if (nbColumns === 1 && !Array.isArray(dataset)) {
    return VIZ_CRITERIA.filter(
      (viz) =>
        viz.geometries.includes(geometryType) &&
        viz.nbColumns === nbColumns &&
        !viz.id.startsWith('texts_') &&
        viz.semioTypes.includes(dataset.semioType) &&
        fitsCategoricalLegibility(viz, [dataset])
    ).map((viz) => ({
      ...viz,
      columns: [dataset.name],
      score: computeSuggestionScore(
        [dataset],
        computeLegibilityFactor(viz, [dataset])
      )
    })) as VizSuggestion[];
  }

  if (nbColumns === 2 && Array.isArray(dataset) && dataset.length === 2) {
    return VIZ_CRITERIA.filter(
      (viz) =>
        viz.geometries.includes(geometryType) &&
        viz.nbColumns === nbColumns &&
        !viz.id.startsWith('texts_') &&
        viz.id !== LABELED_PROPORTIONAL_VIZ_ID &&
        viz.id !== LABELED_CHOROPLETH_VIZ_ID &&
        ((viz.semioTypes[0] === dataset[0].semioType &&
          viz.semioTypes[1] === dataset[1].semioType) ||
          (viz.semioTypes[1] === dataset[0].semioType &&
            viz.semioTypes[0] === dataset[1].semioType)) &&
        fitsCategoricalLegibility(viz, dataset)
    ).map((viz) => ({
      ...viz,
      columns: orderSuggestionColumns(dataset, viz.semioTypes).map(
        (column) => column.name
      ),
      score: computeSuggestionScore(
        dataset,
        computeLegibilityFactor(viz, dataset)
      )
    })) as VizSuggestion[];
  }

  return [];
}

function orderSuggestionColumns(
  columns: EnrichedColumn[],
  semioTypes: readonly SemioType[]
): EnrichedColumn[] {
  if (columns.length !== 2 || semioTypes.length !== 2) {
    return columns;
  }

  const [first, second] = columns;

  if (first.semioType === semioTypes[0] && second.semioType === semioTypes[1]) {
    return columns;
  }

  if (second.semioType === semioTypes[0] && first.semioType === semioTypes[1]) {
    return [second, first];
  }

  return columns;
}

function generateSuggestions(
  columns: EnrichedColumn[],
  geometryType: SimplifiedGeometryType
): VizSuggestion[] {
  const results: VizSuggestion[] = [];

  if (columns.length === 0) {
    return VIZ_CRITERIA.filter(
      (viz) =>
        viz.geometries.includes(geometryType) && viz.semioTypes.length === 0
    ) as VizSuggestion[];
  }

  if (columns.length === 1) {
    results.push(...searchVizByType(columns[0], geometryType, 1));
  } else {
    const first = columns[0];
    const second = columns[1];

    results.push(...searchVizByType(first, geometryType, 1));
    results.push(...searchVizByType(second, geometryType, 1));
    results.push(...searchVizByType([first, second], geometryType, 2));

    let third: EnrichedColumn | undefined;
    if (results.length < 3 && columns.length >= 3) {
      third = columns[2];
      results.push(...searchVizByType(third, geometryType, 1));
      results.push(...searchVizByType([first, third], geometryType, 2));
      results.push(...searchVizByType([second, third], geometryType, 2));
    }

    if (results.length < 3 && columns.length >= 4) {
      const fourth = columns[3];
      const fallbackThird = third ?? columns[2];
      results.push(...searchVizByType(fourth, geometryType, 1));
      results.push(...searchVizByType([first, fourth], geometryType, 2));
      results.push(...searchVizByType([second, fourth], geometryType, 2));
      results.push(
        ...searchVizByType([fallbackThird, fourth], geometryType, 2)
      );
    }
  }

  const unique = results.filter(
    (viz, index, self) => index === self.findIndex((v) => v.id === viz.id)
  );

  return unique;
}

function getImplementationSignature(
  suggestion: VizSuggestion,
  geometryType: SimplifiedGeometryType
): string {
  const columnsKey = suggestion.columns?.join('|') ?? '';

  if (geometryType === SIMPLIFIED_GEOMETRY_TYPE.POINT) {
    if (
      suggestion.id === 'symbols_differents' ||
      suggestion.id === 'symbols_uniques_colorful_QL' ||
      suggestion.id === 'symbols_differents_QLO' ||
      suggestion.id === 'symbols_uniques_colorful_QLO'
    ) {
      return `point-categorical-color:${columnsKey}`;
    }
  }

  if (geometryType === SIMPLIFIED_GEOMETRY_TYPE.POLYGON) {
    if (
      suggestion.id === 'polygons_colorful_QL' ||
      suggestion.id === 'symbols_differents' ||
      suggestion.id === 'symbols_uniques_colorful_QL'
    ) {
      return `polygon-categorical-fill:${columnsKey}`;
    }

    if (
      suggestion.id === 'polygons_colorful_QLO' ||
      suggestion.id === 'symbols_differents_QLO' ||
      suggestion.id === 'symbols_uniques_colorful_QLO'
    ) {
      return `polygon-ordered-categorical-fill:${columnsKey}`;
    }

    if (
      suggestion.id === 'choropleth' ||
      suggestion.id === 'symbols_uniques_colorful_QTR'
    ) {
      return `polygon-classes-fill:${columnsKey}`;
    }
  }

  return `${geometryType}:${suggestion.id}:${columnsKey}`;
}

function getSuggestionPreference(suggestion: VizSuggestion): number {
  switch (suggestion.id) {
    case 'polygons_colorful_QL':
    case 'polygons_colorful_QLO':
    case 'choropleth':
      return 30;
    case 'symbols_uniques_colorful_QL':
    case 'symbols_uniques_colorful_QLO':
    case 'symbols_uniques_colorful_QTR':
      return 20;
    case 'symbols_differents':
    case 'symbols_differents_QLO':
      return 10;
    default:
      return 0;
  }
}

function compareSuggestionPriority(a: VizSuggestion, b: VizSuggestion): number {
  const scoreDelta = (b.score ?? 0) - (a.score ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const preferenceDelta =
    getSuggestionPreference(b) - getSuggestionPreference(a);
  if (preferenceDelta !== 0) {
    return preferenceDelta;
  }

  return a.nbColumns - b.nbColumns;
}

function dedupeSuggestionsByImplementation(
  suggestions: VizSuggestion[],
  geometryType: SimplifiedGeometryType
): VizSuggestion[] {
  const bySignature = new Map<string, VizSuggestion>();

  for (const suggestion of suggestions) {
    const signature = getImplementationSignature(suggestion, geometryType);
    const existing = bySignature.get(signature);

    if (!existing || compareSuggestionPriority(existing, suggestion) > 0) {
      bySignature.set(signature, suggestion);
    }
  }

  return [...bySignature.values()];
}

function suggestVisualizations(
  columns: ColumnAnalysis[],
  geometryType: GeometryType | null,
  options: { maxSuggestions?: number } = {}
): VizSuggestion[] {
  const { maxSuggestions = 3 } = options;

  if (!geometryType) {
    return [];
  }

  const simplifiedGeomType = simplifyGeometryType(geometryType);

  const enrichedColumns = columns
    .map((col) => getColumnSemioType(col))
    .filter((col) => col.isSuggestionCandidate)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aNulls = getNullCount(a);
      const bNulls = getNullCount(b);
      return aNulls - bNulls;
    });

  const thematicColumns = enrichedColumns
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOID)
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOLAT)
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOLON)
    .filter((col) => getUniqueCount(col) > 1);

  const rankedColumns = thematicColumns
    .filter((col) => col.semioType !== SEMIO_TYPES.LABEL)
    .filter((col) => col.score >= MIN_THEMATIC_SEMIO_SCORE);

  const textEligibleColumns = thematicColumns;

  const suggestions = [
    ...generateSuggestions(rankedColumns, simplifiedGeomType),
    ...generateLabeledSuggestions(textEligibleColumns, simplifiedGeomType),
    ...generateTextSuggestions(textEligibleColumns, simplifiedGeomType)
  ];

  return dedupeSuggestionsByImplementation(
    suggestions.sort(compareSuggestionPriority),
    simplifiedGeomType
  )
    .sort(compareSuggestionPriority)
    .slice(0, maxSuggestions);
}

export const vizSuggester = {
  suggestVisualizations
};
