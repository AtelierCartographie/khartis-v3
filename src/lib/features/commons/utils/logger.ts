export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN'
}

export enum LogCategory {
  PERSISTENCE = 'PERSIST',
  FILE = 'FILE',
  DATA = 'DATA',
  STORE = 'STORE',
  DUCKDB = 'DUCKDB',
  PROJECT = 'PROJECT',
  VISUALIZATION = 'VISUALIZATION',
  MAP = 'MAP',
  UI = 'UI',
  EXPORT = 'EXPORT',
  SYSTEM = 'SYSTEM'
}

interface LogOptions {
  category: LogCategory;
  level?: LogLevel;
  data?: unknown;
}

export interface LoggerErrorContext {
  feature?: string;
  flow?: string;
  tool?: string;
  primitive?: string;
  extra?: Record<string, unknown>;
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
    minLevel: parseLogLevel(import.meta.env.VITE_LOG_LEVEL) || LogLevel.WARN,
    includeStack: import.meta.env.VITE_LOG_STACK === 'true'
  };
  let recentLogs: RecentLog[] = [];

  function shouldLog(category: LogCategory, level: LogLevel): boolean {
    if (!config.enabled) return false;
    if (!config.categories.has(category)) return false;

    const levels = [LogLevel.WARN, LogLevel.ERROR];
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
      console.warn('[logger] repeated log suppressed', {
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

  function log(message: string, options: LogOptions): void {
    const level = options.level || LogLevel.WARN;

    if (!shouldLog(options.category, level)) return;

    if (detectInfiniteLoop(message, options.category)) {
      return;
    }

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = `[${timestamp}] [${level}] [${options.category}]`;

    let data = options.data;
    if (
      config.includeStack &&
      level === LogLevel.ERROR &&
      data instanceof Error
    ) {
      data = {
        name: data.name,
        message: data.message,
        stack: data.stack
      };
    }

    const logFn = level === LogLevel.ERROR ? console.error : console.warn;

    if (data !== undefined) {
      logFn(`${prefix} ${message}`, data);
    } else {
      logFn(`${prefix} ${message}`);
    }
  }

  function errorLog(
    message: string,
    category: LogCategory,
    data?: unknown,
    context?: LoggerErrorContext
  ): void {
    if (!context) {
      log(message, { category, level: LogLevel.ERROR, data });
      return;
    }

    const contextualData =
      data === undefined
        ? { context }
        : {
            data:
              config.includeStack && data instanceof Error
                ? {
                    name: data.name,
                    message: data.message,
                    stack: data.stack
                  }
                : data,
            context
          };

    log(message, {
      category,
      level: LogLevel.ERROR,
      data: contextualData
    });
  }

  function warn(message: string, category: LogCategory, data?: unknown): void {
    log(message, { category, level: LogLevel.WARN, data });
  }

  function isEnabled(): boolean {
    return config.enabled;
  }

  return {
    error: errorLog,
    warn,
    isEnabled
  };
}

export const logger = createLogger();
