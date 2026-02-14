export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  SUCCESS = 'SUCCESS'
}

export enum LogCategory {
  PERSISTENCE = 'PERSIST',
  NOTIFICATION = 'NOTIFICATION',
  FILE = 'FILE',
  DATA = 'DATA',
  STORE = 'STORE',
  DUCKDB = 'DUCKDB',
  PROJECT = 'PROJECT',
  VISUALIZATION = 'VISUALIZATION',
  MAP = 'MAP',
  UI = 'UI',
  EXPORT = 'EXPORT',
  ERROR_HANDLER = 'ERROR',
  SYSTEM = 'SYSTEM'
}

interface LogOptions {
  category: LogCategory;
  level?: LogLevel;
  data?: unknown;
}

interface LoggerConfig {
  enabled: boolean;
  categories: Set<LogCategory>;
  minLevel: LogLevel;
  includeStack: boolean;
}

interface RecentLog {
  time: number;
  key: string;
}

const LOOP_DETECTION_WINDOW_MS = 100;
const LOOP_DETECTION_THRESHOLD = 10;

function parseCategories(value: string | undefined): Set<LogCategory> {
  if (!value || value === 'all') {
    return new Set(Object.values(LogCategory));
  }
  return new Set(
    value
      .split(',')
      .map((c) => c.trim().toUpperCase() as LogCategory)
      .filter((c) => Object.values(LogCategory).includes(c))
  );
}

function parseLogLevel(value: string | undefined): LogLevel | null {
  if (!value) return null;
  const level = value.toUpperCase() as LogLevel;
  return Object.values(LogLevel).includes(level) ? level : null;
}

function createLogger() {
  const isTest =
    import.meta.env.MODE === 'test' ||
    typeof import.meta.env.VITEST !== 'undefined';
  const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
  const debugEnabled =
    import.meta.env.VITE_DEBUG === 'true' ||
    import.meta.env.VITE_DEBUG_AUTH === 'true';

  const config: LoggerConfig = {
    enabled: !isTest && (isDev || debugEnabled),
    categories: parseCategories(import.meta.env.VITE_LOG_CATEGORIES),
    minLevel: parseLogLevel(import.meta.env.VITE_LOG_LEVEL) || LogLevel.DEBUG,
    includeStack: import.meta.env.VITE_LOG_STACK === 'true'
  };
  let recentLogs: RecentLog[] = [];

  function shouldLog(category: LogCategory, level: LogLevel): boolean {
    if (!config.enabled) return false;
    if (!config.categories.has(category)) return false;

    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
      LogLevel.SUCCESS
    ];
    const minIndex = levels.indexOf(config.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  function detectInfiniteLoop(message: string, category: LogCategory): boolean {
    const key = `${category}:${message}`;
    const now = Date.now();

    recentLogs = recentLogs.filter(
      (recentLog) => now - recentLog.time < LOOP_DETECTION_WINDOW_MS
    );

    const sameLogCount = recentLogs.filter(
      (recentLog) => recentLog.key === key
    ).length;

    if (sameLogCount >= LOOP_DETECTION_THRESHOLD) {
      console.error('🚨 INFINITE LOOP DETECTED:', {
        key,
        occurrences: sameLogCount,
        window: `${LOOP_DETECTION_WINDOW_MS}ms`,
        recentLogs: recentLogs.slice(-5)
      });
      recentLogs = [];
      return true;
    }

    recentLogs.push({ time: now, key });
    return false;
  }

  function getIcon(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return '🔴';

      case LogLevel.WARN:
        return '⚠️';

      case LogLevel.INFO:
        return '🔵';

      case LogLevel.DEBUG:
        return '🔍';

      case LogLevel.SUCCESS:
        return '✅';

      default:
        return '📝';
    }
  }

  function getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return 'color: #ff0000; font-weight: bold';

      case LogLevel.WARN:
        return 'color: #ff9800; font-weight: bold';

      case LogLevel.INFO:
        return 'color: #2196f3';

      case LogLevel.DEBUG:
        return 'color: #9e9e9e';

      case LogLevel.SUCCESS:
        return 'color: #4caf50; font-weight: bold';

      default:
        return 'color: #000000';
    }
  }

  function log(message: string, options: LogOptions): void {
    const level = options.level || LogLevel.INFO;

    if (!shouldLog(options.category, level)) return;

    if (detectInfiniteLoop(message, options.category)) {
      return;
    }

    const icon = getIcon(level);
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = `${icon} [${timestamp}] [${options.category}]`;

    const style = getColor(level);

    let data = options.data;
    if (
      config.includeStack &&
      level === LogLevel.ERROR &&
      data instanceof Error
    ) {
      data = {
        ...data,
        stack: data.stack
      };
    }

    const logFn = level === LogLevel.ERROR ? console.error : console.log;

    if (data !== undefined) {
      logFn(`%c${prefix} ${message}`, style, data);
    } else {
      logFn(`%c${prefix} ${message}`, style);
    }
  }

  function startTiming(label: string, category: LogCategory): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      debug(`${label} completed`, category, {
        duration: `${duration.toFixed(2)}ms`,
        durationMs: duration
      });
    };
  }

  async function time<T>(
    label: string,
    category: LogCategory,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    debug(`${label} started`, category);

    try {
      const result = await fn();
      const duration = performance.now() - start;
      success(`${label} completed`, category, {
        duration: `${duration.toFixed(2)}ms`,
        durationMs: duration
      });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      errorLog(`${label} failed`, category, {
        duration: `${duration.toFixed(2)}ms`,
        durationMs: duration,
        error
      });
      throw error;
    }
  }

  function errorLog(
    message: string,
    category: LogCategory,
    data?: unknown
  ): void {
    log(message, { category, level: LogLevel.ERROR, data });
  }

  function warn(message: string, category: LogCategory, data?: unknown): void {
    log(message, { category, level: LogLevel.WARN, data });
  }

  function info(message: string, category: LogCategory, data?: unknown): void {
    log(message, { category, level: LogLevel.INFO, data });
  }

  function debug(message: string, category: LogCategory, data?: unknown): void {
    log(message, { category, level: LogLevel.DEBUG, data });
  }

  function success(
    message: string,
    category: LogCategory,
    data?: unknown
  ): void {
    log(message, { category, level: LogLevel.SUCCESS, data });
  }

  function group(title: string, category: LogCategory): void {
    if (!config.enabled) return;
    console.group(`[${category}] ${title}`);
  }

  function groupEnd(): void {
    if (!config.enabled) return;
    console.groupEnd();
  }

  function isEnabled(): boolean {
    return config.enabled;
  }

  return {
    log,
    startTiming,
    time,
    error: errorLog,
    warn,
    info,
    debug,
    success,
    group,
    groupEnd,
    isEnabled
  };
}

export const logger = createLogger();
