export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

export function formatDate(
  date: Date | string,
  locale: string = 'fr-FR'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export interface FormatValueOptions {
  locale?: string;
  maxFractionDigits?: number;
  maxStringLength?: number;
  nullPlaceholder?: string;
}

const DEFAULT_FORMAT_OPTIONS: Required<FormatValueOptions> = {
  locale: 'fr-FR',
  maxFractionDigits: 2,
  maxStringLength: 50,
  nullPlaceholder: '\u2014'
};

export function formatValue(
  value: unknown,
  options?: FormatValueOptions
): string {
  const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };

  if (value === null || value === undefined) {
    return opts.nullPlaceholder;
  }

  if (typeof value === 'bigint') {
    return Number(value).toLocaleString(opts.locale);
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toLocaleString(opts.locale);
    }
    return value.toLocaleString(opts.locale, {
      maximumFractionDigits: opts.maxFractionDigits
    });
  }

  if (value instanceof Date) {
    return formatDate(value, opts.locale);
  }

  const str = String(value);
  if (str.length > opts.maxStringLength) {
    return str.slice(0, opts.maxStringLength - 3) + '...';
  }
  return str;
}

export function isNumericType(type: string): boolean {
  return (
    type === 'number' ||
    type === 'integer' ||
    type === 'bigint' ||
    type === 'numeric'
  );
}

export function formatValueByType(
  value: unknown,
  columnType: string,
  options?: FormatValueOptions
): string {
  const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };

  if (value === null || value === undefined) {
    return '';
  }

  if (columnType === 'date' && value instanceof Date) {
    return formatDate(value, opts.locale);
  }

  if (isNumericType(columnType)) {
    return Number(value).toLocaleString(opts.locale);
  }

  return String(value);
}
