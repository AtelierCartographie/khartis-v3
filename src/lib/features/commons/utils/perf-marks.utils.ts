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

function logPerfSummary(): void {
  summaryTimer = null;
  if (completedEntries.length === 0) {
    return;
  }
  const originMs = completedEntries.reduce(
    (min, entry) => Math.min(min, entry.startMs),
    Number.POSITIVE_INFINITY
  );
  const rows = [...completedEntries]
    .sort((a, b) => a.startMs - b.startMs)
    .map((entry) => ({
      phase: entry.phase,
      start: `+${(entry.startMs - originMs).toFixed(0)}ms`,
      duration: `${entry.durationMs.toFixed(1)}ms`
    }));
  const totalMs = completedEntries.reduce(
    (sum, entry) => sum + entry.durationMs,
    0
  );
  logger.warn(
    `[perf] ${rows.length} phase measures, ${totalMs.toFixed(0)}ms measured`,
    LogCategory.SYSTEM,
    rows
  );
}
