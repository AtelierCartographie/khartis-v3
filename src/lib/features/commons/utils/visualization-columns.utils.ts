import { isLikelyCoordinateColumn } from './geo-detector.utils';

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
