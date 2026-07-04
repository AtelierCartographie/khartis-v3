const QUOTED_VALUE_PATTERN = /^["'](.*)["']$/;

export function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export function unquoteCsvValue(value: string): string {
  const match = value.match(QUOTED_VALUE_PATTERN);
  return match ? match[1] : value;
}
