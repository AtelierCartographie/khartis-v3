import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime.js';

const LOCALE_MAP: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-US'
};

export function resolveLocale(): string {
  return LOCALE_MAP[getLocale()] ?? 'en-US';
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** Singular form of a count in the locale: 0 and 1 in French, 1 alone in English. */
export function isSingularCount(
  count: number | bigint,
  locale: string = resolveLocale()
): boolean {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(Number(count)) === 'one';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return m.file_size_zero();

  const units = [
    m.file_size_unit_b(),
    m.file_size_unit_kb(),
    m.file_size_unit_mb(),
    m.file_size_unit_gb(),
    m.file_size_unit_tb()
  ];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const formattedSize = (bytes / Math.pow(k, i)).toLocaleString(
    resolveLocale(),
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );

  return `${formattedSize} ${units[i]}`;
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
  /** False for years, which never take a thousands separator. */
  useGrouping?: boolean;
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
  const useGrouping = options?.useGrouping ?? true;

  if (value === null || value === undefined) {
    return nullPlaceholder;
  }

  if (typeof value === 'bigint') {
    return Number(value).toLocaleString(locale, { useGrouping });
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toLocaleString(locale, { useGrouping });
    }
    return value.toLocaleString(locale, {
      maximumFractionDigits: maxFractionDigits,
      useGrouping
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
    return Number(value).toLocaleString(locale, {
      useGrouping: options?.useGrouping ?? true
    });
  }

  return String(value);
}
