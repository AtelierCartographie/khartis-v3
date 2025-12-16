export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  SUCCESS = 'SUCCESS'
}

export enum LogCategory {
  AUTH = 'AUTH',
  PERSISTENCE = 'PERSIST',
  CACHE = 'CACHE',
  LOAD = 'LOAD',
  SYNC = 'SYNC',
  TEST_MODE = 'TEST_MODE',
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
  IMPORT = 'IMPORT',
  GEOLOCATION = 'GEOLOCATION',
  JOIN = 'JOIN',
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

class Logger {
  private config: LoggerConfig;

  private recentLogs: RecentLog[] = [];

  private readonly LOOP_DETECTION_WINDOW = 100; // ms

  private readonly LOOP_DETECTION_THRESHOLD = 10; // occurrences

  constructor() {
    const isTest = import.meta.env.MODE === 'test' || typeof import.meta.env.VITEST !== 'undefined';
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    const debugEnabled =
      import.meta.env.VITE_DEBUG === 'true' ||
      import.meta.env.VITE_DEBUG_AUTH === 'true';

    this.config = {
      enabled: !isTest && (isDev || debugEnabled),
      categories: this.parseCategories(import.meta.env.VITE_LOG_CATEGORIES),
      minLevel:
        this.parseLogLevel(import.meta.env.VITE_LOG_LEVEL) || LogLevel.DEBUG,
      includeStack: import.meta.env.VITE_LOG_STACK === 'true'
    };
  }

  private parseCategories(value: string | undefined): Set<LogCategory> {
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

  private parseLogLevel(value: string | undefined): LogLevel | null {
    if (!value) return null;
    const level = value.toUpperCase() as LogLevel;
    return Object.values(LogLevel).includes(level) ? level : null;
  }

  private shouldLog(category: LogCategory, level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.categories.has(category)) return false;

    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
      LogLevel.SUCCESS
    ];
    const minIndex = levels.indexOf(this.config.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  private detectInfiniteLoop(message: string, category: LogCategory): boolean {
    const key = `${category}:${message}`;
    const now = Date.now();

    // Clean logs older than detection window
    this.recentLogs = this.recentLogs.filter(
      (log) => now - log.time < this.LOOP_DETECTION_WINDOW
    );

    // Count occurrences of same log
    const sameLogCount = this.recentLogs.filter(
      (log) => log.key === key
    ).length;

    if (sameLogCount >= this.LOOP_DETECTION_THRESHOLD) {
      console.error('🚨 INFINITE LOOP DETECTED:', {
        key,
        occurrences: sameLogCount,
        window: `${this.LOOP_DETECTION_WINDOW}ms`,
        recentLogs: this.recentLogs.slice(-5)
      });
      // Clear to avoid spamming
      this.recentLogs = [];
      return true;
    }

    this.recentLogs.push({ time: now, key });
    return false;
  }

  private getIcon(level: LogLevel): string {
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

  private getColor(level: LogLevel): string {
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

  log(message: string, options: LogOptions): void {
    const level = options.level || LogLevel.INFO;

    if (!this.shouldLog(options.category, level)) return;

    // Detect infinite loops
    if (this.detectInfiniteLoop(message, options.category)) {
      return; // Stop logging to prevent console spam
    }

    const icon = this.getIcon(level);
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = `${icon} [${timestamp}] [${options.category}]`;

    const style = this.getColor(level);

    // Add stack trace for errors if configured
    let data = options.data;
    if (
      this.config.includeStack &&
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

  /**
   * Start timing an operation
   * Returns a function that when called, logs the duration
   *
   * @example
   * const endTiming = logger.startTiming('Parse CSV', LogCategory.FILE);
   * // ... do work ...
   * endTiming(); // Logs: "Parse CSV completed" with duration
   */
  startTiming(label: string, category: LogCategory): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.debug(`${label} completed`, category, {
        duration: `${duration.toFixed(2)}ms`,
        durationMs: duration
      });
    };
  }

  /**
   * Log with automatic performance timing
   *
   * @example
   * await logger.time('Parse CSV', LogCategory.FILE, async () => {
   *   return await parseFile(file);
   * });
   */
  async time<T>(
    label: string,
    category: LogCategory,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    this.debug(`${label} started`, category);

    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.success(`${label} completed`, category, {
        duration: `${duration.toFixed(2)}ms`,
        durationMs: duration
      });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, category, {
        duration: `${duration.toFixed(2)}ms`,
        durationMs: duration,
        error
      });
      throw error;
    }
  }

  error(message: string, category: LogCategory, data?: unknown): void {
    this.log(message, { category, level: LogLevel.ERROR, data });
  }

  warn(message: string, category: LogCategory, data?: unknown): void {
    this.log(message, { category, level: LogLevel.WARN, data });
  }

  info(message: string, category: LogCategory, data?: unknown): void {
    this.log(message, { category, level: LogLevel.INFO, data });
  }

  debug(message: string, category: LogCategory, data?: unknown): void {
    this.log(message, { category, level: LogLevel.DEBUG, data });
  }

  success(message: string, category: LogCategory, data?: unknown): void {
    this.log(message, { category, level: LogLevel.SUCCESS, data });
  }

  // Special method for grouping related logs
  group(title: string, category: LogCategory): void {
    if (!this.config.enabled) return;
    console.group(`[${category}] ${title}`);
  }

  groupEnd(): void {
    if (!this.config.enabled) return;
    console.groupEnd();
  }

  // Method to check if logging is enabled
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

export const logger = new Logger();
