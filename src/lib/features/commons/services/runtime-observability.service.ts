import { browser } from '$app/environment';
import { posthogService } from '$lib/features/commons/services/posthog.service';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

interface TargetSnapshot {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  ariaLabel?: string;
  type?: string;
  name?: string;
}

interface InteractionSnapshot {
  eventType: string;
  time: number;
  target?: TargetSnapshot;
  key?: string;
  pointerType?: string;
  clientX?: number;
  clientY?: number;
}

interface PerformanceEntrySnapshot {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  blockingDuration?: number;
  firstUIEventTimestamp?: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  scripts?: ScriptTimingSnapshot[];
  attribution?: Record<string, unknown>[];
}

interface WorkerWatchdogConfig {
  apiKey: string;
  apiHost: string;
  appVersion: string;
  distinctId: string;
}

interface ScriptTimingSnapshot {
  duration?: number;
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  sourceCharPosition?: number;
  forcedStyleAndLayoutDuration?: number;
  pauseDuration?: number;
}

const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'input'];
const RECENT_INTERACTION_LIMIT = 20;
const RECENT_PERFORMANCE_LIMIT = 10;
const LONG_TASK_REPORT_THRESHOLD_MS = 500;
const LONG_ANIMATION_FRAME_REPORT_THRESHOLD_MS = 500;
const WATCHDOG_INTERVAL_MS = 1000;
const MAIN_THREAD_STALL_THRESHOLD_MS = 3000;
const MAIN_THREAD_STALL_REPORT_THROTTLE_MS = 30000;
const WORKER_WATCHDOG_ID_STORAGE_KEY = 'khartis.runtime_watchdog_id';
const WORKER_STALL_DB_NAME = 'khartis-runtime-observability';
const WORKER_STALL_STORE_NAME = 'worker-stalls';
const WORKER_STALL_REPLAY_LIMIT = 20;

let installed = false;
let expectedWatchdogTick = 0;
let lastStallReportAt = 0;
let workerWatchdog: Worker | null = null;
const recentInteractions: InteractionSnapshot[] = [];
const recentLongTasks: PerformanceEntrySnapshot[] = [];
const recentLongAnimationFrames: PerformanceEntrySnapshot[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function roundTiming(value: number): number {
  return Math.round(value * 100) / 100;
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? roundTiming(candidate)
    : undefined;
}

function readArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return [];
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}

function compactString(value: string | null | undefined): string | undefined {
  const compacted = value?.trim().replace(/\s+/g, ' ');
  return compacted ? compacted.slice(0, 120) : undefined;
}

function compactPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return `${url.pathname}${url.hash}`;
  } catch {
    return value.slice(0, 160);
  }
}

function getCurrentLocationProperties(): Record<string, unknown> {
  return {
    path: window.location.pathname,
    hash: window.location.hash || undefined,
    visibilityState: document.visibilityState,
    appVersion: import.meta.env.VITE_APP_VERSION || undefined
  };
}

function getTargetSnapshot(
  target: EventTarget | null
): TargetSnapshot | undefined {
  if (!(target instanceof Element)) return undefined;

  const element =
    target.closest(
      'button, a, input, select, textarea, [role], [aria-label], [data-testid]'
    ) ?? target;
  const classes = Array.from(element.classList)
    .map((className) => compactString(className))
    .filter((className): className is string => Boolean(className))
    .slice(0, 6);

  return {
    tag: element.tagName.toLowerCase(),
    id: compactString(element.id),
    classes: classes.length > 0 ? classes : undefined,
    role: compactString(element.getAttribute('role')),
    ariaLabel: compactString(element.getAttribute('aria-label')),
    type: compactString(element.getAttribute('type')),
    name: compactString(element.getAttribute('name'))
  };
}

function getSafeKey(event: KeyboardEvent): string {
  if (event.key.length === 1) {
    return event.key === ' ' ? 'Space' : 'Character';
  }
  return event.key;
}

function rememberBounded<T>(items: T[], item: T, limit: number): void {
  items.push(item);
  while (items.length > limit) {
    items.shift();
  }
}

function getPointerType(event: Event): string | undefined {
  if (!isRecord(event)) return undefined;
  const pointerType = event.pointerType;
  return typeof pointerType === 'string' ? pointerType : undefined;
}

function captureInteraction(event: Event): void {
  const snapshot: InteractionSnapshot = {
    eventType: event.type,
    time: Date.now(),
    target: getTargetSnapshot(event.target)
  };

  if (event instanceof KeyboardEvent) {
    snapshot.key = getSafeKey(event);
  }
  if (event instanceof MouseEvent) {
    snapshot.clientX = Math.round(event.clientX);
    snapshot.clientY = Math.round(event.clientY);
  }

  snapshot.pointerType = getPointerType(event);
  rememberBounded(recentInteractions, snapshot, RECENT_INTERACTION_LIMIT);
  postWorkerHeartbeat();
}

function getRecentContext(): Record<string, unknown> {
  return {
    ...getCurrentLocationProperties(),
    lastInteraction: recentInteractions.at(-1),
    recentInteractions: recentInteractions.slice(-5),
    recentLongTasks: recentLongTasks.slice(-5),
    recentLongAnimationFrames: recentLongAnimationFrames.slice(-5)
  };
}

function captureObservabilityEvent(
  eventName: string,
  properties: Record<string, unknown>
): void {
  posthogService.captureEvent(eventName, {
    ...getRecentContext(),
    ...properties
  });
}

function summarizeAttribution(value: unknown): Record<string, unknown> {
  return {
    name: readString(value, 'name'),
    entryType: readString(value, 'entryType'),
    startTime: readNumber(value, 'startTime'),
    duration: readNumber(value, 'duration'),
    containerType: readString(value, 'containerType'),
    containerName: readString(value, 'containerName'),
    containerId: readString(value, 'containerId'),
    containerSrc: compactPath(readString(value, 'containerSrc'))
  };
}

function summarizeScriptTiming(value: unknown): ScriptTimingSnapshot {
  return {
    duration: readNumber(value, 'duration'),
    invoker: compactString(readString(value, 'invoker')),
    invokerType: compactString(readString(value, 'invokerType')),
    sourceURL: compactPath(readString(value, 'sourceURL')),
    sourceFunctionName: compactString(readString(value, 'sourceFunctionName')),
    sourceCharPosition: readNumber(value, 'sourceCharPosition'),
    forcedStyleAndLayoutDuration: readNumber(
      value,
      'forcedStyleAndLayoutDuration'
    ),
    pauseDuration: readNumber(value, 'pauseDuration')
  };
}

function summarizePerformanceEntry(
  entry: PerformanceEntry
): PerformanceEntrySnapshot {
  const snapshot: PerformanceEntrySnapshot = {
    name: entry.name,
    entryType: entry.entryType,
    startTime: roundTiming(entry.startTime),
    duration: roundTiming(entry.duration),
    blockingDuration: readNumber(entry, 'blockingDuration'),
    firstUIEventTimestamp: readNumber(entry, 'firstUIEventTimestamp'),
    renderStart: readNumber(entry, 'renderStart'),
    styleAndLayoutStart: readNumber(entry, 'styleAndLayoutStart')
  };

  const scripts = readArray(entry, 'scripts')
    .map(summarizeScriptTiming)
    .slice(0, 5);
  if (scripts.length > 0) snapshot.scripts = scripts;

  const attribution = readArray(entry, 'attribution')
    .map(summarizeAttribution)
    .slice(0, 3);
  if (attribution.length > 0) snapshot.attribution = attribution;

  return snapshot;
}

function observePerformanceEntries(
  entryType: 'longtask' | 'long-animation-frame',
  thresholdMs: number,
  storage: PerformanceEntrySnapshot[],
  eventName: string
): void {
  if (typeof PerformanceObserver === 'undefined') return;
  if (!PerformanceObserver.supportedEntryTypes.includes(entryType)) return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const snapshot = summarizePerformanceEntry(entry);
      rememberBounded(storage, snapshot, RECENT_PERFORMANCE_LIMIT);
      if (snapshot.duration >= thresholdMs) {
        captureObservabilityEvent(eventName, { entry: snapshot });
      }
    }
  });

  observer.observe({ type: entryType, buffered: true });
}

function reportMainThreadStall(delayMs: number): void {
  const now = Date.now();
  if (now - lastStallReportAt < MAIN_THREAD_STALL_REPORT_THROTTLE_MS) {
    return;
  }
  lastStallReportAt = now;

  const blockedMs = roundTiming(delayMs);
  const properties = {
    blockedMs,
    watchdogIntervalMs: WATCHDOG_INTERVAL_MS,
    thresholdMs: MAIN_THREAD_STALL_THRESHOLD_MS
  };

  captureObservabilityEvent('khartis_main_thread_stall', properties);
  logger.warn('Main thread stall detected', LogCategory.SYSTEM, {
    ...getRecentContext(),
    ...properties
  });
}

function createRuntimeWatchdogId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getRuntimeWatchdogId(): string {
  try {
    const stored = window.localStorage.getItem(WORKER_WATCHDOG_ID_STORAGE_KEY);
    if (stored) return stored;

    const nextId = createRuntimeWatchdogId();
    window.localStorage.setItem(WORKER_WATCHDOG_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    return createRuntimeWatchdogId();
  }
}

function getWorkerWatchdogConfig(): WorkerWatchdogConfig | null {
  const config = posthogService.getCaptureConfig();
  if (!config) return null;

  return {
    ...config,
    distinctId: getRuntimeWatchdogId()
  };
}

function createWorkerWatchdogScript(): string {
  return `
let captureConfig = null;
let lastContext = {};
let lastHeartbeatAt = Date.now();
let lastReportAt = 0;
const watchdogIntervalMs = ${WATCHDOG_INTERVAL_MS};
const thresholdMs = ${MAIN_THREAD_STALL_THRESHOLD_MS};
const reportThrottleMs = ${MAIN_THREAD_STALL_REPORT_THROTTLE_MS};
const stallDbName = ${JSON.stringify(WORKER_STALL_DB_NAME)};
const stallStoreName = ${JSON.stringify(WORKER_STALL_STORE_NAME)};

function roundTiming(value) {
  return Math.round(value * 100) / 100;
}

function buildCaptureUrl(apiHost) {
  try {
    return new URL('/i/v0/e/', apiHost).toString();
  } catch {
    return null;
  }
}

async function captureWorkerStall(report) {
  if (!captureConfig) return;

  const url = buildCaptureUrl(captureConfig.apiHost);
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: captureConfig.apiKey,
        event: 'khartis_worker_watchdog_stall',
        distinct_id: captureConfig.distinctId,
        properties: {
          ...report,
          appVersion: captureConfig.appVersion || undefined,
          $process_person_profile: false
        },
        timestamp: new Date(report.detectedAt).toISOString()
      })
    });
  } catch (error) {
    console.warn('Khartis worker watchdog failed to report stall', error);
  }
}

function openStallDatabase() {
  return new Promise((resolve, reject) => {
    if (!self.indexedDB) {
      resolve(null);
      return;
    }

    const request = self.indexedDB.open(stallDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(stallStoreName)) {
        db.createObjectStore(stallStoreName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function persistWorkerStall(report) {
  const db = await openStallDatabase();
  if (!db) return;

  try {
    const transaction = db.transaction(stallStoreName, 'readwrite');
    transaction.objectStore(stallStoreName).put({
      ...report,
      id: String(report.detectedAt)
    });
    await waitForTransaction(transaction);
  } catch (error) {
    console.warn('Khartis worker watchdog failed to persist stall', error);
  } finally {
    db.close();
  }
}

function reportStall(now) {
  if (lastContext?.visibilityState !== 'visible') return;
  if (now - lastReportAt < reportThrottleMs) return;
  lastReportAt = now;

  const report = {
    reportedBy: 'worker',
    blockedMs: roundTiming(now - lastHeartbeatAt),
    lastHeartbeatAt,
    detectedAt: now,
    thresholdMs,
    watchdogIntervalMs,
    context: lastContext
  };

  void persistWorkerStall(report).finally(() => {
    console.warn('Khartis main thread heartbeat missed', report);
    void captureWorkerStall(report);
    self.postMessage({ type: 'stall', report });
  });
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'configure') {
    captureConfig = data.config ?? null;
    lastContext = data.context ?? lastContext;
    return;
  }

  if (data.type === 'heartbeat') {
    lastHeartbeatAt = Date.now();
    lastContext = data.context ?? lastContext;
  }
});

setInterval(() => {
  const now = Date.now();
  if (now - lastHeartbeatAt >= thresholdMs) {
    reportStall(now);
  }
}, watchdogIntervalMs);
`;
}

function postWorkerMessage(message: Record<string, unknown>): void {
  if (!workerWatchdog) return;
  try {
    workerWatchdog.postMessage(message);
  } catch (error) {
    logger.warn('Failed to update worker watchdog', LogCategory.SYSTEM, error);
  }
}

function postWorkerHeartbeat(): void {
  postWorkerMessage({
    type: 'heartbeat',
    context: getRecentContext()
  });
}

function openWorkerStallDatabase(): Promise<IDBDatabase | null> {
  if (typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(WORKER_STALL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKER_STALL_STORE_NAME)) {
        db.createObjectStore(WORKER_STALL_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function waitForDatabaseTransaction(
  transaction: IDBTransaction
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function readPersistedWorkerStalls(): Promise<Record<string, unknown>[]> {
  const db = await openWorkerStallDatabase();
  if (!db) return [];

  try {
    const transaction = db.transaction(WORKER_STALL_STORE_NAME, 'readonly');
    const request = transaction.objectStore(WORKER_STALL_STORE_NAME).getAll();
    const records = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await waitForDatabaseTransaction(transaction);

    return Array.isArray(records)
      ? records.filter(isRecord).slice(-WORKER_STALL_REPLAY_LIMIT)
      : [];
  } catch (error) {
    logger.warn(
      'Failed to read worker stall reports',
      LogCategory.SYSTEM,
      error
    );
    return [];
  } finally {
    db.close();
  }
}

async function clearPersistedWorkerStalls(): Promise<void> {
  const db = await openWorkerStallDatabase();
  if (!db) return;

  try {
    const transaction = db.transaction(WORKER_STALL_STORE_NAME, 'readwrite');
    transaction.objectStore(WORKER_STALL_STORE_NAME).clear();
    await waitForDatabaseTransaction(transaction);
  } catch (error) {
    logger.warn(
      'Failed to clear worker stall reports',
      LogCategory.SYSTEM,
      error
    );
  } finally {
    db.close();
  }
}

function replayPersistedWorkerStalls(): void {
  void (async () => {
    const reports = await readPersistedWorkerStalls();
    if (reports.length === 0) return;

    for (const report of reports) {
      const properties = {
        ...report,
        deliveredAfterReload: true
      };
      captureObservabilityEvent('khartis_worker_watchdog_stall', properties);
      logger.warn(
        'Worker watchdog persisted main thread stall',
        LogCategory.SYSTEM,
        {
          ...getRecentContext(),
          ...properties
        }
      );
    }

    await clearPersistedWorkerStalls();
  })();
}

function isWorkerStallMessage(
  value: unknown
): value is { type: 'stall'; report: Record<string, unknown> } {
  if (!isRecord(value)) return false;
  return value.type === 'stall' && isRecord(value.report);
}

function captureWorkerStallAfterRecovery(event: MessageEvent<unknown>): void {
  if (!isWorkerStallMessage(event.data)) return;

  const properties = {
    ...event.data.report,
    deliveredAfterRecovery: true
  };
  captureObservabilityEvent('khartis_worker_watchdog_stall', properties);
  logger.warn(
    'Worker watchdog reported main thread stall',
    LogCategory.SYSTEM,
    {
      ...getRecentContext(),
      ...properties
    }
  );
  void clearPersistedWorkerStalls();
}

function startWorkerWatchdog(): void {
  if (workerWatchdog || typeof Worker === 'undefined') return;

  const workerUrl = URL.createObjectURL(
    new Blob([createWorkerWatchdogScript()], { type: 'text/javascript' })
  );

  try {
    workerWatchdog = new Worker(workerUrl, {
      name: 'khartis-runtime-watchdog'
    });
  } catch (error) {
    logger.warn('Failed to start worker watchdog', LogCategory.SYSTEM, error);
    return;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }

  workerWatchdog.addEventListener('message', captureWorkerStallAfterRecovery);
  postWorkerMessage({
    type: 'configure',
    config: getWorkerWatchdogConfig(),
    context: getRecentContext()
  });
  window.setInterval(postWorkerHeartbeat, WATCHDOG_INTERVAL_MS);
}

function startMainThreadWatchdog(): void {
  expectedWatchdogTick = performance.now() + WATCHDOG_INTERVAL_MS;

  window.setInterval(() => {
    const now = performance.now();
    const delayMs = now - expectedWatchdogTick;
    expectedWatchdogTick = now + WATCHDOG_INTERVAL_MS;

    if (
      document.visibilityState === 'visible' &&
      delayMs >= MAIN_THREAD_STALL_THRESHOLD_MS
    ) {
      reportMainThreadStall(delayMs);
    }
  }, WATCHDOG_INTERVAL_MS);
}

function captureWindowError(event: ErrorEvent): void {
  posthogService.captureException(event.error ?? event.message, {
    category: LogCategory.SYSTEM,
    flow: 'window_error',
    extra: {
      ...getRecentContext(),
      message: event.message,
      filename: compactPath(event.filename),
      lineno: event.lineno,
      colno: event.colno
    }
  });
}

function captureUnhandledRejection(event: PromiseRejectionEvent): void {
  posthogService.captureException(event.reason, {
    category: LogCategory.SYSTEM,
    flow: 'unhandled_rejection',
    extra: getRecentContext()
  });
}

export function installRuntimeObservability(): void {
  if (!browser || installed) return;
  installed = true;

  for (const eventName of INTERACTION_EVENTS) {
    window.addEventListener(eventName, captureInteraction, {
      capture: true,
      passive: true
    });
  }
  window.addEventListener('error', captureWindowError);
  window.addEventListener('unhandledrejection', captureUnhandledRejection);

  observePerformanceEntries(
    'longtask',
    LONG_TASK_REPORT_THRESHOLD_MS,
    recentLongTasks,
    'khartis_long_task'
  );
  observePerformanceEntries(
    'long-animation-frame',
    LONG_ANIMATION_FRAME_REPORT_THRESHOLD_MS,
    recentLongAnimationFrames,
    'khartis_long_animation_frame'
  );
  startMainThreadWatchdog();
  startWorkerWatchdog();
  replayPersistedWorkerStalls();
}
