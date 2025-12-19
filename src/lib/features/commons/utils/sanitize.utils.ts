export function sanitizeProjectName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let sanitized = name.replace(/[<>:"/\\|?*]/g, '');

  sanitized = sanitized.substring(0, 255);

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

/**
 * Escapes double quotes in a string for safe use in SQL identifiers.
 * Replaces " with "" (two double quotes) as per SQL standard escaping.
 * Use this for table names and column names wrapped in double quotes.
 *
 * @example
 * escapeIdentifier('my"column') // Returns 'my""column'
 * escapeIdentifier("test") // Returns "test"
 */
export function escapeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}
