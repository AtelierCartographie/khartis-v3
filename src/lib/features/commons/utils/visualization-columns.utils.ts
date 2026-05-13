import { isLikelyCoordinateColumn } from './geo-detector.utils';
import {
  COLUMN_TYPE_GEOMETRY,
  EXCLUDED_COLUMNS,
  INTERNAL_COLUMN
} from '../constants/data.constants';

type ColumnLike = {
  name?: string | null;
  text?: string | null;
  type?: string | null;
};

interface ColumnSelectionOptions {
  exclude?: Array<string | undefined>;
  preferred?: string | undefined;
  allowIdLikeFallback?: boolean;
  excludeLikelyCoordinates?: boolean;
}

function resolveColumnName(column: ColumnLike | undefined): string | undefined {
  return column?.name ?? column?.text ?? undefined;
}

function isNumericColumn(column: ColumnLike): boolean {
  return column.type === 'number';
}

function isTextColumn(column: ColumnLike): boolean {
  return column.type === 'text' || column.type === 'string';
}

export function isIdLikeColumnName(name: string): boolean {
  return /^(ogc_fid|fid|id|gid|objectid|oid|__id__?|__feature_id__)$/i.test(
    name.trim()
  );
}

export function isHiddenTechnicalColumnName(name: string): boolean {
  return /^__/.test(name.trim());
}

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase();
}

const VISUALIZATION_EXCLUDED_COLUMN_NAMES = new Set<string>([
  ...EXCLUDED_COLUMNS,
  INTERNAL_COLUMN.WKB_GEOMETRY,
  INTERNAL_COLUMN.THE_GEOM
]);

export function isVisualizableDataColumn(column: ColumnLike): boolean {
  const name = resolveColumnName(column);
  if (!name) return false;

  if (column.type === COLUMN_TYPE_GEOMETRY) {
    return false;
  }

  if (isHiddenTechnicalColumnName(name)) {
    return false;
  }

  return !VISUALIZATION_EXCLUDED_COLUMN_NAMES.has(normalizeColumnName(name));
}

export function filterVisualizableDataColumns<T extends ColumnLike>(
  columns: T[]
): T[] {
  return columns.filter(isVisualizableDataColumn);
}

export function isAutoFacetDataColumn(column: ColumnLike): boolean {
  const name = resolveColumnName(column);
  return Boolean(
    name && isVisualizableDataColumn(column) && !isIdLikeColumnName(name)
  );
}

export function isAutoFacetNumericColumn(column: ColumnLike): boolean {
  return isAutoFacetDataColumn(column) && isNumericColumn(column);
}

function resolveYearColumnName(name: string): number | undefined {
  const normalized = name.trim().replace(/^_+/, '');
  if (!/^\d{4}$/.test(normalized)) {
    return undefined;
  }
  const year = Number(normalized);
  return year >= 1800 && year <= 2200 ? year : undefined;
}

export function findLatestYearNumericColumn(
  columns: ColumnLike[],
  exclude: Array<string | undefined> = []
): string | undefined {
  const reserved = new Set(
    exclude.filter((name): name is string => Boolean(name))
  );
  const latest = columns.reduce<{ name: string; year: number } | undefined>(
    (acc, column) => {
      const name = resolveColumnName(column);
      if (
        !name ||
        !isNumericColumn(column) ||
        reserved.has(name) ||
        isHiddenTechnicalColumnName(name)
      ) {
        return acc;
      }
      const year = resolveYearColumnName(name);
      if (year === undefined) return acc;
      return acc && acc.year >= year ? acc : { name, year };
    },
    undefined
  );
  return latest?.name;
}

export function findPreferredNumericColumn(
  columns: ColumnLike[],
  {
    exclude = [],
    preferred,
    allowIdLikeFallback = false,
    excludeLikelyCoordinates = false
  }: ColumnSelectionOptions = {}
): string | undefined {
  const reserved = new Set(
    exclude.filter((name): name is string => Boolean(name))
  );

  const candidates = columns.filter((column) => {
    const name = resolveColumnName(column);
    if (!name || !isNumericColumn(column) || reserved.has(name)) {
      return false;
    }

    if (isHiddenTechnicalColumnName(name)) {
      return false;
    }

    if (excludeLikelyCoordinates && isLikelyCoordinateColumn(name)) {
      return false;
    }

    return true;
  });

  const preferredCandidate = preferred
    ? candidates.find((column) => resolveColumnName(column) === preferred)
    : undefined;
  if (preferredCandidate) {
    return resolveColumnName(preferredCandidate);
  }

  const semanticCandidate = candidates.find((column) => {
    const name = resolveColumnName(column);
    return name ? !isIdLikeColumnName(name) : false;
  });
  if (semanticCandidate) {
    return resolveColumnName(semanticCandidate);
  }

  return allowIdLikeFallback ? resolveColumnName(candidates[0]) : undefined;
}

export function findPreferredTextColumn(
  columns: ColumnLike[],
  {
    exclude = [],
    preferred,
    excludeLikelyCoordinates = false
  }: ColumnSelectionOptions = {}
): string | undefined {
  const reserved = new Set(
    exclude.filter((name): name is string => Boolean(name))
  );

  const candidates = columns.filter((column) => {
    const name = resolveColumnName(column);
    if (!name) {
      return false;
    }

    return (
      isTextColumn(column) &&
      !reserved.has(name) &&
      !isHiddenTechnicalColumnName(name) &&
      (!excludeLikelyCoordinates || !isLikelyCoordinateColumn(name))
    );
  });

  const preferredCandidate = preferred
    ? candidates.find((column) => resolveColumnName(column) === preferred)
    : undefined;

  if (preferredCandidate) {
    return resolveColumnName(preferredCandidate);
  }

  const semanticCandidate = candidates.find((column) => {
    const name = resolveColumnName(column);
    return name ? !isIdLikeColumnName(name) : false;
  });

  return resolveColumnName(semanticCandidate ?? candidates[0]);
}
