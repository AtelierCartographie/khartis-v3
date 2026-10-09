import { EnvironmentUtils } from './environment.utils';
import { LogCategory, logger } from './logger';

export const PERF_PHASE = {
  FILE_IMPORT: 'file-import',
  COLUMN_ANALYSIS: 'column-analysis',
  PROJECT_SAVE: 'project-save',
  PROJECT_RESTORE: 'project-restore',
  GEOLOCATION_STEP: 'geolocation-step',
  SIMILARITY_CACHE: 'similarity-cache',
  JOIN_GRADING: 'join-grading',
  JOIN_FINALIZE: 'join-finalize',
  GEOMETRY_FETCH: 'geometry-fetch',
  ARROW_TABLE: 'arrow-table',
  GEOARROW_PARSE: 'geoarrow-parse'
} as const;

export type PerfPhase = (typeof PERF_PHASE)[keyof typeof PERF_PHASE];

const MARK_PREFIX = 'khartis:';
const SUMMARY_QUIET_DELAY_MS = 2000;
const SLOW_PHASE_MS = 1000;
const FULL_SUMMARY_STORAGE_KEY = 'khartis:perf-summary';

const IS_DEV = import.meta.env.DEV;

const supportsUserTiming =
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function';

interface PerfEntry {
  phase: PerfPhase;
  startMs: number;
  durationMs: number;
}

const pendingStartsByPhase = new Map<PerfPhase, number[]>();
const completedEntries: PerfEntry[] = [];
let summaryTimer: ReturnType<typeof setTimeout> | null = null;

function isPerfDebugEnabled(): boolean {
  return IS_DEV || EnvironmentUtils.isPreproduction();
}

export function perfMark(phase: PerfPhase): void {
  if (!isPerfDebugEnabled()) {
    return;
  }
  const starts = pendingStartsByPhase.get(phase) ?? [];
  starts.push(performance.now());
  pendingStartsByPhase.set(phase, starts);
  if (supportsUserTiming) {
    performance.mark(`${MARK_PREFIX}${phase}:start`);
  }
}

export function perfMeasure(phase: PerfPhase): void {
  if (!isPerfDebugEnabled()) {
    return;
  }
  const starts = pendingStartsByPhase.get(phase);
  if (!starts) {
    return;
  }
  const startMs = starts.pop();
  if (startMs === undefined) {
    return;
  }
  if (supportsUserTiming) {
    const startMarkName = `${MARK_PREFIX}${phase}:start`;
    performance.measure(`${MARK_PREFIX}${phase}`, startMarkName);
    if (starts.length === 0) {
      performance.clearMarks(startMarkName);
    }
  }
  completedEntries.push({
    phase,
    startMs,
    durationMs: performance.now() - startMs
  });
  scheduleSummaryLog();
}

function scheduleSummaryLog(): void {
  if (summaryTimer !== null) {
    clearTimeout(summaryTimer);
  }
  summaryTimer = setTimeout(logPerfSummary, SUMMARY_QUIET_DELAY_MS);
}

function isFullSummaryRequested(): boolean {
  try {
    return localStorage.getItem(FULL_SUMMARY_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function toSummaryRows(entries: PerfEntry[], originMs: number) {
  return [...entries]
    .sort((a, b) => a.startMs - b.startMs)
    .map((entry) => ({
      phase: entry.phase,
      start: `+${(entry.startMs - originMs).toFixed(0)}ms`,
      duration: `${entry.durationMs.toFixed(1)}ms`
    }));
}

/**
 * Reports one burst of measures, then forgets it. A burst is quiet unless a
 * phase is slow; the full table is opt-in through localStorage. The User
 * Timing measures stay in the browser Performance panel either way.
 */
function logPerfSummary(): void {
  summaryTimer = null;
  const entries = completedEntries.splice(0);
  if (entries.length === 0) {
    return;
  }
  const originMs = entries.reduce(
    (min, entry) => Math.min(min, entry.startMs),
    Number.POSITIVE_INFINITY
  );

  if (isFullSummaryRequested()) {
    const totalMs = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
    logger.warn(
      `[perf] ${entries.length} phase measures, ${totalMs.toFixed(0)}ms measured`,
      LogCategory.SYSTEM,
      toSummaryRows(entries, originMs)
    );
    return;
  }

  const slowEntries = entries.filter(
    (entry) => entry.durationMs >= SLOW_PHASE_MS
  );
  if (slowEntries.length === 0) {
    return;
  }
  logger.warn(
    `[perf] ${slowEntries.length} phase measures over ${SLOW_PHASE_MS}ms`,
    LogCategory.SYSTEM,
    toSummaryRows(slowEntries, originMs)
  );
}
