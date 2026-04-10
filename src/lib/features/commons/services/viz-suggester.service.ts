import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  detectSemioType,
  SEMIO_TYPES,
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
export type SimplifiedGeometryType = 'point' | 'line' | 'polygon';
export type { SemioType };

export interface VizSuggestion {
  id: string;
  label: string;
  nbColumns: number;
  semioTypes: SemioType[];
  geometries: SimplifiedGeometryType[];
  columns?: string[];
  score?: number;
}

export interface EnrichedColumn extends ColumnAnalysis {
  name: string;
  type: string;
  semioType: SemioType;
  score: number;
}

export { SEMIO_TYPES };

/**
 * Cartographic visualization criteria
 * Based on https://docs.google.com/spreadsheets/d/1F6gk998PXV4FvPNRJZ59YPnmsXJ4h6BLyRZupvrRRdw/edit#gid=0
 */
const VIZ_CRITERIA: readonly VizSuggestion[] = [
  {
    id: 'symbols_uniques',
    label: m.viz_suggestion_symbols_uniques(),
    nbColumns: 0,
    semioTypes: [],
    geometries: ['point', 'polygon']
  },
  {
    id: 'polygons_colorful_QL',
    label: m.viz_suggestion_polygons_colorful_ql(),
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['polygon']
  },
  {
    id: 'choropleth',
    label: m.viz_suggestion_choropleth(),
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['polygon']
  },
  {
    id: 'symbols_uniques_colorful_QTR',
    label: m.viz_suggestion_symbols_unique_colorful_qtr(),
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_differents',
    label: m.viz_suggestion_symbols_different_ql(),
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_uniques_colorful_QL',
    label: m.viz_suggestion_symbols_unique_colorful_ql(),
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional',
    label: m.viz_suggestion_symbols_proportional(),
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_colorful_QL',
    label: m.viz_suggestion_symbols_proportional_colorful_ql(),
    nbColumns: 2,
    semioTypes: ['QTA', 'QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_colorful_QTR',
    label: m.viz_suggestion_symbols_proportional_colorful_qtr(),
    nbColumns: 2,
    semioTypes: ['QTA', 'QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_proportional_double',
    label: m.viz_suggestion_symbols_proportional_double(),
    nbColumns: 2,
    semioTypes: ['QTA', 'QTA'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'polygons_uniques',
    label: m.viz_suggestion_polygons_unique(),
    nbColumns: 0,
    semioTypes: [],
    geometries: ['polygon']
  },
  {
    id: 'lines_uniques',
    label: m.viz_suggestion_lines_unique(),
    nbColumns: 0,
    semioTypes: [],
    geometries: ['line']
  },
  {
    id: 'lines_colorful_QL',
    label: m.viz_suggestion_lines_colorful_ql(),
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['line']
  },
  {
    id: 'lines_colorful_QTR',
    label: m.viz_suggestion_lines_colorful_qtr(),
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional',
    label: m.viz_suggestion_lines_proportional(),
    nbColumns: 1,
    semioTypes: ['QTA'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional_colorful_QL',
    label: m.viz_suggestion_lines_proportional_colorful_ql(),
    nbColumns: 2,
    semioTypes: ['QTA', 'QL'],
    geometries: ['line']
  },
  {
    id: 'lines_proportional_colorful_QTR',
    label: m.viz_suggestion_lines_proportional_colorful_qtr(),
    nbColumns: 2,
    semioTypes: ['QTA', 'QTR'],
    geometries: ['line']
  },
  {
    id: 'polygons_colorful_QLO',
    label: m.viz_suggestion_polygons_colorful_qlo(),
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['polygon']
  },
  {
    id: 'symbols_differents_QLO',
    label: m.viz_suggestion_symbols_different_qlo(),
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'symbols_uniques_colorful_QLO',
    label: m.viz_suggestion_symbols_unique_colorful_qlo(),
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'lines_colorful_QLO',
    label: m.viz_suggestion_lines_colorful_qlo(),
    nbColumns: 1,
    semioTypes: ['QLO'],
    geometries: ['line']
  },
  {
    id: 'texts_colorful_QL',
    label: m.viz_suggestion_texts_colorful_ql(),
    nbColumns: 2,
    semioTypes: ['QL', 'QL'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'texts_colorful_QTR',
    label: m.viz_suggestion_texts_colorful_qtr(),
    nbColumns: 2,
    semioTypes: ['QL', 'QTR'],
    geometries: ['point', 'polygon']
  },
  {
    id: 'texts_proportional',
    label: m.viz_suggestion_texts_proportional(),
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

const STRING_LIKE_COLUMN_TYPES = [
  COLUMN_TYPE.STRING,
  COLUMN_TYPE.TEXT,
  COLUMN_TYPE.BOOLEAN
] as const;
const LABEL_COLUMN_KEYWORDS = [
  'name',
  'nom',
  'label',
  'title',
  'libelle',
  'libellé',
  'address',
  'adresse',
  'city',
  'commune',
  'quartier',
  'site',
  'station',
  'stop'
] as const;
const ID_COLUMN_KEYWORDS = [
  'id',
  'fid',
  'gid',
  'oid',
  'pk',
  'code',
  'iso',
  'objectid',
  'object_id',
  'rowid'
] as const;
const MAX_TEXT_POINT_FEATURES = 150;

function simplifyGeometryType(geomType: GeometryType): SimplifiedGeometryType {
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
  if (
    STRING_LIKE_COLUMN_TYPES.includes(
      columnType as (typeof STRING_LIKE_COLUMN_TYPES)[number]
    )
  ) {
    return DuckDBSimplifiedType.STRING;
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

function getColumnSemioType(column: ColumnAnalysis): EnrichedColumn {
  const columnName = column.name ?? '';
  const columnType = (column.type ?? 'string').toString();

  const analysisLike = {
    name: columnName,
    type_simple: mapTypeToSimple(columnType),
    count: getTotalCount(column),
    uniques: getUniqueCount(column),
    nulls: getNullCount(column),
    min: typeof column.stats?.min === 'number' ? column.stats.min : undefined,
    max: typeof column.stats?.max === 'number' ? column.stats.max : undefined,
    share_integers: column.stats?.share_integers,
    share_floats: column.stats?.share_floats,
    share_rank_interval: column.stats?.share_rank_interval,
    extent_magnitude: column.stats?.extent_magnitude
  };

  const { semioType, semioScore } = detectSemioType(analysisLike);

  return {
    ...column,
    name: columnName || '(column)',
    type: columnType,
    semioType,
    score: semioScore
  };
}

function computeSuggestionScore(columns: EnrichedColumn[]): number {
  if (columns.length === 0) return 0;
  const totalScore = columns.reduce((sum, col) => sum + col.score, 0);
  const avgScore = totalScore / columns.length;
  const MAX_SEMIO_SCORE = 6.5;
  return Math.round((avgScore / MAX_SEMIO_SCORE) * 100);
}

function getShareUniques(column: EnrichedColumn): number {
  const totalCount = getTotalCount(column);
  if (totalCount <= 0) return 0;
  return getUniqueCount(column) / totalCount;
}

function isStringLikeColumn(column: EnrichedColumn): boolean {
  return (
    STRING_LIKE_COLUMN_TYPES.includes(
      column.type.toLowerCase() as (typeof STRING_LIKE_COLUMN_TYPES)[number]
    ) || column.type.toLowerCase() === COLUMN_TYPE.DATE
  );
}

function getNameTokens(columnName: string): string[] {
  return columnName
    .toLowerCase()
    .split(/[^a-zA-Z0-9%]/)
    .filter(Boolean);
}

function hasNamedKeyword(
  columnName: string,
  keywords: readonly string[]
): boolean {
  const tokens = getNameTokens(columnName);
  return (
    tokens.some((token) => keywords.includes(token)) ||
    keywords.some((keyword) => columnName.toLowerCase().includes(keyword))
  );
}

function isLabelCandidate(column: EnrichedColumn): boolean {
  if (!isStringLikeColumn(column)) return false;

  const uniqueCount = getUniqueCount(column);
  if (uniqueCount <= 1) return false;

  const shareUniques = getShareUniques(column);
  const hasLabelKeyword = hasNamedKeyword(column.name, LABEL_COLUMN_KEYWORDS);
  const hasIdKeyword = hasNamedKeyword(column.name, ID_COLUMN_KEYWORDS);

  if (hasIdKeyword && !hasLabelKeyword) return false;

  return hasLabelKeyword || shareUniques >= 0.4 || uniqueCount >= 20;
}

function scoreLabelCandidate(column: EnrichedColumn): number {
  const hasLabelKeyword = hasNamedKeyword(column.name, LABEL_COLUMN_KEYWORDS);

  return (
    (hasLabelKeyword ? 2 : 0) +
    Math.min(getShareUniques(column), 1) +
    Math.min(getUniqueCount(column) / 50, 1)
  );
}

function generateTextSuggestions(
  columns: EnrichedColumn[],
  geometryType: SimplifiedGeometryType
): VizSuggestion[] {
  if (geometryType === 'line') {
    return [];
  }

  const totalFeatures = Math.max(
    ...columns.map((column) => getTotalCount(column)),
    0
  );
  if (geometryType === 'point' && totalFeatures > MAX_TEXT_POINT_FEATURES) {
    return [];
  }

  const labelCandidate = columns
    .filter((column) => isLabelCandidate(column))
    .sort((a, b) => scoreLabelCandidate(b) - scoreLabelCandidate(a))[0];

  if (!labelCandidate) {
    return [];
  }

  const thematicCandidates = columns.filter((column) => {
    if (column.name === labelCandidate.name) return false;
    if (column.semioType === SEMIO_TYPES.GEOID) return false;
    if (
      column.semioType === SEMIO_TYPES.QL ||
      column.semioType === SEMIO_TYPES.QLO
    ) {
      return getUniqueCount(column) <= 12;
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
  const bestAbsolute = thematicCandidates.find(
    (column) => column.semioType === SEMIO_TYPES.QTA
  );

  const results: VizSuggestion[] = [];

  if (bestQualitative) {
    const viz = VIZ_CRITERIA.find((entry) => entry.id === 'texts_colorful_QL');
    if (viz) {
      results.push({
        ...viz,
        columns: [labelCandidate.name, bestQualitative.name],
        score: computeSuggestionScore([labelCandidate, bestQualitative])
      });
    }
  }

  if (bestRatio) {
    const viz = VIZ_CRITERIA.find((entry) => entry.id === 'texts_colorful_QTR');
    if (viz) {
      results.push({
        ...viz,
        columns: [labelCandidate.name, bestRatio.name],
        score: computeSuggestionScore([labelCandidate, bestRatio])
      });
    }
  }

  if (bestAbsolute) {
    const viz = VIZ_CRITERIA.find((entry) => entry.id === 'texts_proportional');
    if (viz) {
      results.push({
        ...viz,
        columns: [labelCandidate.name, bestAbsolute.name],
        score: computeSuggestionScore([labelCandidate, bestAbsolute])
      });
    }
  }

  return results;
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
        viz.semioTypes.includes(dataset.semioType)
    ).map((viz) => ({
      ...viz,
      columns: [dataset.name],
      score: computeSuggestionScore([dataset])
    })) as VizSuggestion[];
  }

  if (nbColumns === 2 && Array.isArray(dataset) && dataset.length === 2) {
    return VIZ_CRITERIA.filter(
      (viz) =>
        viz.geometries.includes(geometryType) &&
        viz.nbColumns === nbColumns &&
        !viz.id.startsWith('texts_') &&
        ((viz.semioTypes[0] === dataset[0].semioType &&
          viz.semioTypes[1] === dataset[1].semioType) ||
          (viz.semioTypes[1] === dataset[0].semioType &&
            viz.semioTypes[0] === dataset[1].semioType))
    ).map((viz) => ({
      ...viz,
      columns: orderSuggestionColumns(dataset, viz.semioTypes).map(
        (column) => column.name
      ),
      score: computeSuggestionScore(dataset)
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

  if (geometryType === 'point') {
    if (
      suggestion.id === 'symbols_differents' ||
      suggestion.id === 'symbols_uniques_colorful_QL' ||
      suggestion.id === 'symbols_differents_QLO' ||
      suggestion.id === 'symbols_uniques_colorful_QLO'
    ) {
      return `point-categorical-color:${columnsKey}`;
    }
  }

  if (geometryType === 'polygon') {
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
  options: { maxSuggestions?: number; debug?: boolean } = {}
): VizSuggestion[] {
  const { maxSuggestions = 3, debug = false } = options;

  if (!geometryType) {
    return [];
  }

  const simplifiedGeomType = simplifyGeometryType(geometryType);

  const enrichedColumns = columns
    .map((col) => getColumnSemioType(col))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aNulls = getNullCount(a);
      const bNulls = getNullCount(b);
      return aNulls - bNulls;
    });

  const rankedColumns = enrichedColumns
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOID)
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOLAT)
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOLON)
    .filter((col) => getUniqueCount(col) > 1);

  const textEligibleColumns = enrichedColumns
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOLAT)
    .filter((col) => col.semioType !== SEMIO_TYPES.GEOLON)
    .filter((col) => getUniqueCount(col) > 1);

  if (debug) {
    logger.debug('Viz suggester inputs', LogCategory.VISUALIZATION, {
      geometry: simplifiedGeomType,
      columns: rankedColumns.map((col) => ({
        name: col.name,
        semioType: col.semioType,
        score: col.score
      }))
    });
  }

  const suggestions = [
    ...generateSuggestions(rankedColumns, simplifiedGeomType),
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
