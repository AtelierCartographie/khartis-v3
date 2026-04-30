export function sanitizeProjectName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let sanitized = name.replace(/[<>:"/\\|?*]/g, '');

  sanitized = sanitized.substring(0, 255);

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

type SanitizeTextInputOptions = {
  trim?: boolean;
};

export function sanitizeTextInput(
  input: string,
  options: SanitizeTextInputOptions = {}
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const boundedInput =
    options.trim === false ? input : input.replace(/\s+/g, ' ').trim();

  return boundedInput.substring(0, 500);
}

export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function escapeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}
