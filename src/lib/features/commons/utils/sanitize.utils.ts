export function sanitizeProjectName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let sanitized = name.replace(/[<>:"/\\|?*]/g, '');

  sanitized = sanitized.substring(0, 100);

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
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
