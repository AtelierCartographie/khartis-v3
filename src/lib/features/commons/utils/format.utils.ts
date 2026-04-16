import { getLocale } from '$lib/paraglide/runtime.js';

const LOCALE_MAP: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-US'
};

function resolveLocale(): string {
  return LOCALE_MAP[getLocale()] ?? 'en-US';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

export function formatDate(date: Date | string, locale?: string): string {
  locale = locale ?? resolveLocale();
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

const DEFAULT_FORMAT_OPTIONS = {
  maxFractionDigits: 2,
  maxStringLength: 50,
  nullPlaceholder: '\u2014'
} as const;

export function formatValue(
  value: unknown,
  options?: FormatValueOptions
): string {
  const locale = options?.locale ?? resolveLocale();
  const maxFractionDigits =
    options?.maxFractionDigits ?? DEFAULT_FORMAT_OPTIONS.maxFractionDigits;
  const maxStringLength =
    options?.maxStringLength ?? DEFAULT_FORMAT_OPTIONS.maxStringLength;
  const nullPlaceholder =
    options?.nullPlaceholder ?? DEFAULT_FORMAT_OPTIONS.nullPlaceholder;

  if (value === null || value === undefined) {
    return nullPlaceholder;
  }

  if (typeof value === 'bigint') {
    return Number(value).toLocaleString(locale);
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toLocaleString(locale);
    }
    return value.toLocaleString(locale, {
      maximumFractionDigits: maxFractionDigits
    });
  }

  if (value instanceof Date) {
    return formatDate(value, locale);
  }

  const str = String(value);
  if (str.length > maxStringLength) {
    return str.slice(0, maxStringLength - 3) + '...';
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
  const locale = options?.locale ?? resolveLocale();

  if (value === null || value === undefined) {
    return '';
  }

  if (columnType === 'date' && value instanceof Date) {
    return formatDate(value, locale);
  }

  if (isNumericType(columnType)) {
    return Number(value).toLocaleString(locale);
  }

  return String(value);
}
