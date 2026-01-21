export type JsonReplacer = (key: string, value: unknown) => unknown;

export function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

export function deepClone<T>(obj: T, replacer?: JsonReplacer): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  return JSON.parse(JSON.stringify(obj, replacer)) as T;
}

export function deepCloneWithBigInt<T>(obj: T): T {
  return deepClone(obj, bigIntReplacer);
}

export function safeJsonStringify(data: unknown): string {
  return JSON.stringify(data, bigIntReplacer);
}

export function safeJsonParse<T>(json: string): T {
  return JSON.parse(json) as T;
}
