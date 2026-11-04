/**
 * Calendar-aligned class breaks for date columns.
 *
 * Values are epoch milliseconds read as UTC calendar dates: DuckDB's
 * `epoch_ms` on DATE and TIMESTAMP, and Arrow date values on the render path.
 * Classes are half-open `[start, next start[`, so a threshold is the first
 * instant of a period and every class covers whole periods.
 */

export const CALENDAR_UNIT = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year'
} as const;

export type CalendarUnit = (typeof CALENDAR_UNIT)[keyof typeof CALENDAR_UNIT];

export interface CalendarStep {
  unit: CalendarUnit;
  count: number;
}

export interface CalendarBreaks {
  step: CalendarStep;
  /** Interior thresholds, ascending; `classCount === breaks.length + 1`. */
  breaks: number[];
  /** Start of the first class: `min` floored to the step. */
  lower: number;
  /** Exclusive end of the last class: the first boundary after `max`. */
  upper: number;
}

const DAY_MS = 86_400_000;
// 1970-01-01 is a Thursday: shifting by three days puts Monday at index 0 (ISO week).
const EPOCH_WEEKDAY_OFFSET = 3;

const SHORT_STEPS: readonly CalendarStep[] = [
  { unit: CALENDAR_UNIT.DAY, count: 1 },
  { unit: CALENDAR_UNIT.WEEK, count: 1 },
  { unit: CALENDAR_UNIT.MONTH, count: 1 },
  { unit: CALENDAR_UNIT.MONTH, count: 2 },
  { unit: CALENDAR_UNIT.MONTH, count: 3 },
  { unit: CALENDAR_UNIT.MONTH, count: 6 }
];

const YEAR_MULTIPLIERS = [1, 2, 5, 10, 20, 25, 50] as const;

// Yields 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000… years.
function* yearCounts(): Generator<number> {
  for (let magnitude = 1; ; magnitude *= 100) {
    for (const multiplier of YEAR_MULTIPLIERS) {
      yield multiplier * magnitude;
    }
  }
}

const MAX_YEAR_COUNT = 1_000_000;

/** The calendar step ladder, finest first, up to `maxYearCount` years. */
export function calendarStepLadder(
  maxYearCount = MAX_YEAR_COUNT
): CalendarStep[] {
  const steps = [...SHORT_STEPS];
  for (const count of yearCounts()) {
    if (count > maxYearCount) break;
    steps.push({ unit: CALENDAR_UNIT.YEAR, count });
  }
  return steps;
}

function utc(year: number, monthIndex: number, day = 1): number {
  // Date.UTC maps years 0–99 to 1900–1999; setUTCFullYear does not.
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  return date.getTime();
}

/** Months covered by a month or year step, 0 for days and weeks. */
function stepMonths(step: CalendarStep): number {
  const count = Math.max(1, Math.floor(step.count));
  if (step.unit === CALENDAR_UNIT.MONTH) return count;
  if (step.unit === CALENDAR_UNIT.YEAR) return count * 12;
  return 0;
}

function stepDays(step: CalendarStep): number {
  const count = Math.max(1, Math.floor(step.count));
  return step.unit === CALENDAR_UNIT.WEEK ? count * 7 : count;
}

function monthIndexOfDate(ms: number): number {
  const date = new Date(ms);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(utc(year, monthIndex + 1, 1) - DAY_MS).getUTCDate();
}

/**
 * The `index`-th boundary from `anchor` (negative before it). Months are
 * counted from the anchor itself, so an anchor on the 31st keeps the last day
 * of shorter months instead of drifting into the next one.
 */
function anchoredBoundary(
  anchor: number,
  step: CalendarStep,
  index: number
): number {
  const months = stepMonths(step);
  if (months === 0) {
    return anchor + index * stepDays(step) * DAY_MS;
  }
  const date = new Date(anchor);
  const target = monthIndexOfDate(anchor) + index * months;
  const year = Math.floor(target / 12);
  const monthIndex = ((target % 12) + 12) % 12;
  const timeOfDay = anchor - Math.floor(anchor / DAY_MS) * DAY_MS;
  const day = Math.min(date.getUTCDate(), daysInMonth(year, monthIndex));
  return utc(year, monthIndex, day) + timeOfDay;
}

/** Index of the anchored class that contains `ms`. */
function anchoredIndex(ms: number, anchor: number, step: CalendarStep): number {
  const months = stepMonths(step);
  if (months === 0) {
    return Math.floor((ms - anchor) / (stepDays(step) * DAY_MS));
  }
  let index = Math.floor(
    (monthIndexOfDate(ms) - monthIndexOfDate(anchor)) / months
  );
  if (anchoredBoundary(anchor, step, index) > ms) index -= 1;
  return index;
}

/**
 * Start of the period that contains `ms`. Without an anchor, periods align on
 * the calendar (decades on years in 0, quarters in January); with one, they
 * are counted from the anchor, which is then always a threshold.
 */
export function floorToCalendarStep(
  ms: number,
  step: CalendarStep,
  anchor?: number | null
): number {
  if (anchor != null && Number.isFinite(anchor)) {
    return anchoredBoundary(anchor, step, anchoredIndex(ms, anchor, step));
  }
  const count = Math.max(1, Math.floor(step.count));
  switch (step.unit) {
    case CALENDAR_UNIT.DAY: {
      const day = Math.floor(ms / DAY_MS);
      return Math.floor(day / count) * count * DAY_MS;
    }
    case CALENDAR_UNIT.WEEK: {
      const mondayIndex = Math.floor(
        (Math.floor(ms / DAY_MS) + EPOCH_WEEKDAY_OFFSET) / 7
      );
      const week = Math.floor(mondayIndex / count) * count;
      return (week * 7 - EPOCH_WEEKDAY_OFFSET) * DAY_MS;
    }
    case CALENDAR_UNIT.MONTH: {
      const date = new Date(ms);
      const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth();
      const floored = Math.floor(monthIndex / count) * count;
      return utc(Math.floor(floored / 12), ((floored % 12) + 12) % 12);
    }
    case CALENDAR_UNIT.YEAR: {
      const year = new Date(ms).getUTCFullYear();
      return utc(Math.floor(year / count) * count, 0);
    }
  }
}

export function addCalendarStep(ms: number, step: CalendarStep): number {
  const count = Math.max(1, Math.floor(step.count));
  switch (step.unit) {
    case CALENDAR_UNIT.DAY:
      return ms + count * DAY_MS;
    case CALENDAR_UNIT.WEEK:
      return ms + count * 7 * DAY_MS;
    case CALENDAR_UNIT.MONTH: {
      const date = new Date(ms);
      return utc(
        date.getUTCFullYear(),
        date.getUTCMonth() + count,
        date.getUTCDate()
      );
    }
    case CALENDAR_UNIT.YEAR: {
      const date = new Date(ms);
      return utc(
        date.getUTCFullYear() + count,
        date.getUTCMonth(),
        date.getUTCDate()
      );
    }
  }
}

/** Number of classes `step` gives between `min` and `max`, stopping past `limit`. */
export function countCalendarClasses(
  min: number,
  max: number,
  step: CalendarStep,
  limit = Number.POSITIVE_INFINITY,
  anchor?: number | null
): number {
  if (anchor != null && Number.isFinite(anchor)) {
    return (
      anchoredIndex(max, anchor, step) - anchoredIndex(min, anchor, step) + 1
    );
  }
  let classes = 1;
  let boundary = addCalendarStep(floorToCalendarStep(min, step), step);
  while (boundary <= max) {
    classes += 1;
    if (classes > limit) return classes;
    boundary = addCalendarStep(boundary, step);
  }
  return classes;
}

export function buildCalendarBreaks(
  min: number,
  max: number,
  step: CalendarStep,
  anchor?: number | null
): CalendarBreaks {
  if (anchor != null && Number.isFinite(anchor)) {
    const first = anchoredIndex(min, anchor, step);
    const breaks: number[] = [];
    let index = first + 1;
    let boundary = anchoredBoundary(anchor, step, index);
    while (boundary <= max) {
      breaks.push(boundary);
      index += 1;
      boundary = anchoredBoundary(anchor, step, index);
    }
    return {
      step,
      breaks,
      lower: anchoredBoundary(anchor, step, first),
      upper: boundary
    };
  }
  const lower = floorToCalendarStep(min, step);
  const breaks: number[] = [];
  let boundary = addCalendarStep(lower, step);
  while (boundary <= max) {
    breaks.push(boundary);
    boundary = addCalendarStep(boundary, step);
  }
  return { step, breaks, lower, upper: boundary };
}

/**
 * The finest ladder step that splits `[min, max]` into at most `maxClasses`
 * classes. Recomputing with the class count it returns yields the same step,
 * so storing that count back never makes the step drift.
 */
export function chooseCalendarStep(
  min: number,
  max: number,
  maxClasses: number,
  anchor?: number | null
): CalendarStep {
  const limit = Math.max(1, Math.floor(maxClasses));
  const ladder = calendarStepLadder();
  for (const step of ladder) {
    if (countCalendarClasses(min, max, step, limit, anchor) <= limit) {
      return step;
    }
  }
  return ladder[ladder.length - 1];
}

/** Ladder steps that give between 2 and `maxClasses` classes, up to the first that gives 2. */
export function listCalendarStepOptions(
  min: number,
  max: number,
  maxClasses: number,
  anchor?: number | null
): CalendarStep[] {
  const options: CalendarStep[] = [];
  for (const step of calendarStepLadder()) {
    const classes = countCalendarClasses(min, max, step, maxClasses, anchor);
    if (classes > maxClasses) continue;
    if (classes < 2) break;
    options.push(step);
    // Coarser steps can still straddle a round boundary (2000 splits 500 and
    // 1000 years alike): past the first two-class step they only widen classes.
    if (classes === 2) break;
  }
  return options;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: 'UTC'
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

const MONTH_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  year: 'numeric'
};
const DAY_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
};

/**
 * Label of the class `[start, end[` at the granularity of `step`, with the
 * inclusive end shown: `[2020-01-01, 2020-04-01[` reads « janv.–mars 2020 »,
 * and a class covering a single period shows it once (« 2021 », « mars 2021 »).
 */
export function formatCalendarClassLabel(
  start: number,
  end: number,
  step: CalendarStep,
  locale: string
): string {
  const lastDay = end - DAY_MS;
  // A bound off the step's grid (a pivot date on 10 May in a yearly series) is
  // labelled at its own precision, so neighbouring classes never share a year.
  const precision = inferCalendarGranularity([start, end]).unit;
  const unitRank = (unit: CalendarUnit) =>
    unit === CALENDAR_UNIT.YEAR ? 2 : unit === CALENDAR_UNIT.MONTH ? 1 : 0;
  const labelUnit =
    unitRank(precision) < unitRank(step.unit) ? precision : step.unit;
  if (labelUnit === CALENDAR_UNIT.YEAR) {
    const firstYear = new Date(start).getUTCFullYear();
    const lastYear = new Date(lastDay).getUTCFullYear();
    return firstYear === lastYear
      ? String(firstYear)
      : `${firstYear}–${lastYear}`;
  }

  const unit: CalendarStep = {
    unit:
      labelUnit === CALENDAR_UNIT.MONTH
        ? CALENDAR_UNIT.MONTH
        : CALENDAR_UNIT.DAY,
    count: 1
  };
  const formatter = getFormatter(
    locale,
    unit.unit === CALENDAR_UNIT.MONTH ? MONTH_FORMAT : DAY_FORMAT
  );
  return floorToCalendarStep(start, unit) === floorToCalendarStep(lastDay, unit)
    ? formatter.format(start)
    : formatter.formatRange(start, lastDay);
}

/** A threshold shown on its own (legend tick, manual edit): the first day of a period. */
export function formatCalendarBoundary(
  ms: number,
  step: CalendarStep | undefined,
  locale: string
): string {
  if (
    step?.unit === CALENDAR_UNIT.YEAR &&
    floorToCalendarStep(ms, YEAR_UNIT) === ms
  ) {
    return String(new Date(ms).getUTCFullYear());
  }
  if (
    (step?.unit === CALENDAR_UNIT.YEAR || step?.unit === CALENDAR_UNIT.MONTH) &&
    floorToCalendarStep(ms, MONTH_UNIT) === ms
  ) {
    return getFormatter(locale, MONTH_FORMAT).format(ms);
  }
  return getFormatter(locale, DAY_FORMAT).format(ms);
}

const YEAR_UNIT: CalendarStep = { unit: CALENDAR_UNIT.YEAR, count: 1 };
const MONTH_UNIT: CalendarStep = { unit: CALENDAR_UNIT.MONTH, count: 1 };
const DAY_UNIT: CalendarStep = { unit: CALENDAR_UNIT.DAY, count: 1 };

/** Coarsest unit every bound falls on: all on 1 January → year, all on the 1st → month. */
export function inferCalendarGranularity(
  bounds: readonly number[]
): CalendarStep {
  if (bounds.every((ms) => floorToCalendarStep(ms, YEAR_UNIT) === ms)) {
    return YEAR_UNIT;
  }
  if (bounds.every((ms) => floorToCalendarStep(ms, MONTH_UNIT) === ms)) {
    return MONTH_UNIT;
  }
  return DAY_UNIT;
}

function normalizeMonthToken(token: string): string {
  return token
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.$/, '');
}

function monthIndexOf(token: string, locale: string): number {
  const wanted = normalizeMonthToken(token);
  for (let month = 0; month < 12; month += 1) {
    const at = utc(2000, month, 15);
    const names = [
      getFormatter(locale, { month: 'short' }).format(at),
      getFormatter(locale, { month: 'long' }).format(at)
    ].map(normalizeMonthToken);
    if (names.includes(wanted)) return month;
  }
  return -1;
}

function validUtc(
  year: number,
  monthIndex: number,
  day: number
): number | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const ms = utc(year, monthIndex, day);
  const date = new Date(ms);
  return date.getUTCMonth() === monthIndex && date.getUTCDate() === day
    ? ms
    : null;
}

/**
 * Parses a bound typed by the user, including what `formatCalendarBoundary`
 * shows: « 1975 », « 1975-04 », « 1975-04-12 », « 04/1975 », « 12/04/1975 »
 * (month first in English), « avr. 1975 », « 12 avr. 1975 ».
 */
export function parseCalendarBoundary(
  text: string,
  locale: string
): number | null {
  const value = text.trim().replace(/\s+/g, ' ');
  let match = /^(-?\d{1,4})$/.exec(value);
  if (match) return validUtc(Number(match[1]), 0, 1);

  match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value);
  if (match) {
    return validUtc(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3] ?? 1)
    );
  }

  match = /^(\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match) return validUtc(Number(match[2]), Number(match[1]) - 1, 1);

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match) {
    const monthFirst = locale.toLowerCase().startsWith('en-us');
    const [first, second] = [Number(match[1]), Number(match[2])];
    return monthFirst
      ? validUtc(Number(match[3]), first - 1, second)
      : validUtc(Number(match[3]), second - 1, first);
  }

  match = /^(?:(\d{1,2}) )?([^\d\s]+\.?),? (\d{4})$/u.exec(value);
  if (match) {
    const month = monthIndexOf(match[2], locale);
    return month === -1
      ? null
      : validUtc(Number(match[3]), month, Number(match[1] ?? 1));
  }

  match = /^([^\d\s]+\.?) (\d{1,2}),? (\d{4})$/u.exec(value);
  if (match) {
    const month = monthIndexOf(match[1], locale);
    return month === -1
      ? null
      : validUtc(Number(match[3]), month, Number(match[2]));
  }

  return null;
}

/**
 * `classCount - 1` thresholds evenly spread over `[min, max]`, each snapped to
 * the start of its year, month or day (the coarsest unit the spacing allows).
 * Seeds manual date bounds when the user changes their count.
 */
export function buildEvenCalendarBreaks(
  min: number,
  max: number,
  classCount: number
): number[] {
  const count = Math.max(1, Math.floor(classCount));
  const spacing = (max - min) / count;
  const unit: CalendarStep =
    spacing >= 365 * DAY_MS
      ? { unit: CALENDAR_UNIT.YEAR, count: 1 }
      : spacing >= 28 * DAY_MS
        ? { unit: CALENDAR_UNIT.MONTH, count: 1 }
        : { unit: CALENDAR_UNIT.DAY, count: 1 };
  const breaks: number[] = [];
  for (let index = 1; index < count; index += 1) {
    const snapped = floorToCalendarStep(min + spacing * index, unit);
    if (snapped > min && snapped <= max && snapped !== breaks.at(-1)) {
      breaks.push(snapped);
    }
  }
  return breaks;
}

/** Steps a data-driven threshold may snap to: the ladder without weeks, so labels read in days, months or years. */
const SNAP_LADDER = calendarStepLadder().filter(
  (step) => step.unit !== CALENDAR_UNIT.WEEK
);
// Snapping starts two ladder steps below the regular step for the same class
// count: a yearly series snaps to quarters, a decade-wide one to even years.
const SNAP_STEPS_BELOW_REGULAR = 2;

function snapToNearest(ms: number, step: CalendarStep): number {
  const floor = floorToCalendarStep(ms, step);
  if (floor === ms) return ms;
  const ceil = addCalendarStep(floor, step);
  return ms - floor <= ceil - ms ? floor : ceil;
}

/**
 * Moves data-driven thresholds (k-means on epoch values) to the nearest
 * calendar boundary, on the coarsest step that keeps every class: each
 * threshold distinct and inside `]min, max]`. Only when even single days
 * merge two thresholds does the class count shrink.
 */
export function snapBreaksToCalendar(
  rawBreaks: readonly number[],
  min: number,
  max: number
): number[] {
  const raw = rawBreaks
    .filter((value) => Number.isFinite(value) && value > min && value <= max)
    .sort((a, b) => a - b);
  if (raw.length === 0) return [];

  const regular = chooseCalendarStep(min, max, raw.length + 1);
  const regularIndex = SNAP_LADDER.findIndex(
    (step) => step.unit === regular.unit && step.count === regular.count
  );
  const startIndex = Math.max(
    0,
    (regularIndex < 0 ? 0 : regularIndex) - SNAP_STEPS_BELOW_REGULAR
  );

  for (let index = startIndex; index >= 0; index -= 1) {
    const snapped = raw.map((value) =>
      snapToNearest(value, SNAP_LADDER[index])
    );
    const keepsEveryClass = snapped.every(
      (value, position) =>
        value > min &&
        value <= max &&
        (position === 0 || value > snapped[position - 1])
    );
    if (keepsEveryClass) return snapped;
  }

  return raw
    .map((value) => floorToCalendarStep(value, SNAP_LADDER[0]))
    .filter(
      (value, position, values) =>
        value > min &&
        value <= max &&
        (position === 0 || value > values[position - 1])
    );
}
