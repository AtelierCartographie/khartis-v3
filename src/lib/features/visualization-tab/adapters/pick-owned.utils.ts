type FallbackBag = Readonly<{ [key: string]: unknown }>;

function readFallback(fallbacks: object, key: PropertyKey): unknown {
  return (fallbacks as FallbackBag)[key as string];
}

export function pickOwnedKeys<T extends object>(
  source: Partial<T>,
  keys: ReadonlyArray<keyof T>,
  fallbacks?: object
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    const value = source[key];
    if (fallbacks !== undefined && value === undefined) {
      result[key] = readFallback(fallbacks, key) as T[keyof T];
      continue;
    }
    result[key] = value;
  }
  return result;
}

export interface RenameMapping<S, T> {
  from: keyof S;
  to: keyof T;
}

export function pickRenamedKeys<S extends object, T extends object>(
  source: Partial<S>,
  pairs: ReadonlyArray<RenameMapping<S, T>>,
  fallbacks?: object
): Partial<T> {
  const result: Partial<T> = {};
  for (const { from, to } of pairs) {
    if (!Object.prototype.hasOwnProperty.call(source, from)) {
      continue;
    }
    const value = source[from] as T[keyof T] | undefined;
    if (fallbacks !== undefined && value === undefined) {
      result[to] = readFallback(fallbacks, to) as T[keyof T];
      continue;
    }
    result[to] = value as T[typeof to];
  }
  return result;
}
