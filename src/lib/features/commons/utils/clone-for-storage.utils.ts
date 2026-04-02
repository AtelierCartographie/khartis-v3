export function deepCloneForStorage(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (
    typeof obj === 'string' ||
    typeof obj === 'number' ||
    typeof obj === 'boolean'
  )
    return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof ArrayBuffer) return obj.slice(0);
  if (ArrayBuffer.isView(obj)) {
    const typed = obj as Uint8Array;
    return new Uint8Array(
      typed.buffer.slice(typed.byteOffset, typed.byteOffset + typed.byteLength)
    );
  }
  if (obj instanceof Map) {
    const entries: Array<[unknown, unknown]> = [];
    obj.forEach((value, key) => {
      entries.push([deepCloneForStorage(key), deepCloneForStorage(value)]);
    });
    return Object.fromEntries(entries);
  }
  if (obj instanceof Set) {
    return [...obj].map(deepCloneForStorage);
  }
  if (Array.isArray(obj)) return obj.map(deepCloneForStorage);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepCloneForStorage(value);
    }
    return result;
  }
  return obj;
}
