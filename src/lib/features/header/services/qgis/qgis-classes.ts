import { qgisField, qgisNumber } from './qml';

/** Values `min <= v < max`; an absent bound is open. */
export interface ClassInterval {
  min?: number;
  max?: number;
}

/**
 * The values each class holds, as `getClassIndexForValue` assigns them:
 * the map and the QGIS rules must agree on every value, breaks included.
 * Breaks come in three shapes: inner thresholds (one fewer than the
 * classes), lower bounds (as many as the classes) or full bounds.
 */
export function resolveClassIntervals(
  breaks: readonly number[] | undefined,
  classCount: number
): ClassInterval[][] | null {
  if (!breaks?.length || classCount <= 0) {
    return null;
  }
  const classes: ClassInterval[][] = Array.from(
    { length: classCount },
    () => []
  );
  const last = classCount - 1;

  if (classCount === breaks.length + 1) {
    classes[0].push({ max: breaks[0] });
    for (let i = 1; i < breaks.length; i += 1) {
      classes[i].push({ min: breaks[i - 1], max: breaks[i] });
    }
    classes[last].push({ min: breaks[breaks.length - 1] });
    return classes;
  }

  if (breaks.length === classCount) {
    if (classCount === 1) {
      classes[0].push({});
      return classes;
    }
    classes[0].push({ max: breaks[1] });
    for (let i = 1; i < last; i += 1) {
      classes[i].push({ min: breaks[i], max: breaks[i + 1] });
    }
    classes[last].push({ min: breaks[last] });
    return classes;
  }

  if (breaks.length < 2) {
    classes[last].push({});
    return classes;
  }

  for (let i = 0; i < breaks.length - 1; i += 1) {
    classes[Math.min(i, last)].push({ min: breaks[i], max: breaks[i + 1] });
  }
  classes[last].push({ max: breaks[0] }, { min: breaks[breaks.length - 1] });
  return classes;
}

function intervalCondition(field: string, interval: ClassInterval): string {
  const parts: string[] = [];
  if (interval.min !== undefined) {
    parts.push(`${field} >= ${qgisNumber(interval.min)}`);
  }
  if (interval.max !== undefined) {
    parts.push(`${field} < ${qgisNumber(interval.max)}`);
  }
  return parts.length > 0 ? parts.join(' AND ') : `${field} IS NOT NULL`;
}

/** The QGIS filter selecting a class, `null` when no value falls in it. */
export function classFilterExpression(
  column: string,
  intervals: ClassInterval[]
): string | null {
  const field = qgisField(column);
  const conditions = intervals
    .filter(
      (interval) =>
        interval.min === undefined ||
        interval.max === undefined ||
        interval.min < interval.max
    )
    .map((interval) => intervalCondition(field, interval));
  if (conditions.length === 0) {
    return null;
  }
  // A value is a class value only when it is a finite number.
  const body =
    conditions.length === 1
      ? conditions[0]
      : conditions.map((condition) => `(${condition})`).join(' OR ');
  return `${field} IS NOT NULL AND (${body})`;
}

/**
 * A CASE expression giving each class its value (colour, size), `fallback`
 * outside every class.
 */
export function classCaseExpression(
  column: string,
  classes: ClassInterval[][],
  values: readonly string[],
  fallback: string
): string {
  const branches = classes.flatMap((intervals, index) => {
    const filter = classFilterExpression(column, intervals);
    const value = values[index];
    return filter && value !== undefined
      ? [`WHEN ${filter} THEN ${value}`]
      : [];
  });
  return branches.length > 0
    ? `CASE ${branches.join(' ')} ELSE ${fallback} END`
    : fallback;
}
