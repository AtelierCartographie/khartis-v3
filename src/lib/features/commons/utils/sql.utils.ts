/** Renders a table, column or sequence name as a quoted SQL identifier. */
export function sqlIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Renders a value as a quoted SQL string literal. */
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Reduces a value to `[A-Za-z0-9_]` so it can be part of a generated name. */
export function sqlNamePart(value: string, maxLength?: number): string {
  const part = value.replace(/[^a-zA-Z0-9_]/g, '_');
  return maxLength === undefined ? part : part.slice(0, maxLength);
}

let tempNameSequence = 0;

/** Builds a table or view name that no other call in this session returns. */
export function sqlTempName(prefix: string, value = ''): string {
  tempNameSequence += 1;
  const stem = value ? `${prefix}_${sqlNamePart(value, 48)}` : prefix;
  return `${stem}_${Date.now().toString(36)}_${tempNameSequence}`;
}
