export function sanitizeProjectName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let sanitized = name.replace(/[<>:"/\\|?*]/g, '');

  sanitized = sanitized.substring(0, 100);

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return '';
  }

  let sanitized = fileName.replace(/[<>:"/\\|?*]/g, '_');

  sanitized = sanitized.replace(/^\.+/, '');

  sanitized = sanitized.substring(0, 255);

  return sanitized;
}

export function sanitizeNumericInput(input: string | number): number {
  if (typeof input === 'number') {
    if (!isFinite(input) || isNaN(input)) {
      return 0;
    }
    return input;
  }

  if (typeof input === 'string') {
    const parsed = parseFloat(input);
    if (isNaN(parsed) || !isFinite(parsed)) {
      return 0;
    }
    return parsed;
  }

  return 0;
}

export function sanitizeCSVCell(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  const dangerousStarts = ['=', '+', '-', '@', '\t', '\r'];

  if (dangerousStarts.some((char) => value.startsWith(char))) {
    return "'" + value;
  }

  return value;
}

export function sanitizeTextInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input.replace(/\s+/g, ' ').trim().substring(0, 500);
}

/**
 * Escapes single quotes in a string for safe use in SQL string literals.
 * Replaces ' with '' (two single quotes) as per SQL standard escaping.
 *
 * @example
 * escapeSqlString("O'Brien") // Returns "O''Brien"
 * escapeSqlString("test") // Returns "test"
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
