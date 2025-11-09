const DEBUG_AUTH = import.meta.env.VITE_DEBUG_AUTH === 'true';

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
  ERROR_HANDLER = 'ERROR'
}

interface LogOptions {
  category: LogCategory;
  level?: LogLevel;
  data?: unknown;
}

class Logger {
  private enabled: boolean;

  constructor() {
    this.enabled = DEBUG_AUTH;
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
    if (!this.enabled) return;

    const level = options.level || LogLevel.INFO;
    const icon = this.getIcon(level);
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = `${icon} [${timestamp}] [${options.category}]`;

    const style = this.getColor(level);

    if (options.data !== undefined) {
      console.log(`%c${prefix} ${message}`, style, options.data);
    } else {
      console.log(`%c${prefix} ${message}`, style);
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
    if (!this.enabled) return;
    console.group(`[${category}] ${title}`);
  }

  groupEnd(): void {
    if (!this.enabled) return;
    console.groupEnd();
  }

  // Method to check if logging is enabled
  isEnabled(): boolean {
    return this.enabled;
  }
}

export const logger = new Logger();
