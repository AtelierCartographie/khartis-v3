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

export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function escapeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}
