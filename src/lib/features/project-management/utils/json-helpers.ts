export function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

export function safeJsonStringify(data: unknown): string {
  return JSON.stringify(data, bigIntReplacer);
}

export function safeJsonParse<T>(json: string): T {
  return JSON.parse(json) as T;
}
