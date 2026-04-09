import {
  ColumnType,
  type ColumnStats
} from '$lib/features/data-pipeline/types';

const YEAR_MIN = 1000;
const YEAR_MAX = 3000;
const YEAR_NAME_PATTERN = /(^_?year$)|annee|année|year/i;
const MIN_VALID_YEAR_SHARE = 0.8;
const MAX_REASONABLE_YEAR_SPAN = 250;
const MAX_REASONABLE_YEAR_UNIQUES = 250;

interface YearColumnLike {
  name: string;
  type: ColumnType | string;
  stats?: Partial<ColumnStats>;
}

function parseReasonableInteger(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) ? numericValue : null;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseYearValue(value: unknown): number | null {
  const parsed = parseReasonableInteger(value);
  if (parsed === null) {
    return null;
  }

  return parsed >= YEAR_MIN && parsed <= YEAR_MAX ? parsed : null;
}

function hasYearLikeStats(stats: Partial<ColumnStats> | undefined): boolean {
  if (!stats) {
    return false;
  }

  const min = parseYearValue(stats.min);
  const max = parseYearValue(stats.max);
  if (min === null || max === null || min > max) {
    return false;
  }

  const shareIntegers = stats.share_integers ?? 1;
  if (shareIntegers < MIN_VALID_YEAR_SHARE) {
    return false;
  }

  const uniqueCount = stats.uniques ?? 0;
  return (
    max - min <= MAX_REASONABLE_YEAR_SPAN &&
    (uniqueCount === 0 || uniqueCount <= MAX_REASONABLE_YEAR_UNIQUES)
  );
}

export function isLikelyYearColumn(
  column: YearColumnLike,
  rows: Record<string, unknown>[] = []
): boolean {
  if (column.type !== ColumnType.NUMBER) {
    return false;
  }

  if (YEAR_NAME_PATTERN.test(column.name)) {
    return true;
  }

  if (hasYearLikeStats(column.stats)) {
    return true;
  }

  if (rows.length === 0) {
    return false;
  }

  let validYears = 0;
  let nonNullValues = 0;

  for (const row of rows) {
    const rawValue = row[column.name];
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      continue;
    }

    nonNullValues += 1;
    if (parseYearValue(rawValue) !== null) {
      validYears += 1;
    }
  }

  return (
    nonNullValues > 0 && validYears / nonNullValues >= MIN_VALID_YEAR_SHARE
  );
}

export function collectYearValuesFromRows(
  rows: Record<string, unknown>[],
  columnName: string
): number[] {
  const values = new Set<number>();

  for (const row of rows) {
    const parsed = parseYearValue(row[columnName]);
    if (parsed !== null) {
      values.add(parsed);
    }
  }

  return [...values].sort((a, b) => a - b);
}

export function collectYearValues(values: Iterable<unknown>): number[] {
  const years = new Set<number>();

  for (const value of values) {
    const parsed = parseYearValue(value);
    if (parsed !== null) {
      years.add(parsed);
    }
  }

  return [...years].sort((a, b) => a - b);
}
