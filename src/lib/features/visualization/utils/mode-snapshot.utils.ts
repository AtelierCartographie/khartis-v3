export function snapshotByKeys<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = source[key];
  }
  return result;
}

export function applyByKeys<T extends object>(
  state: Partial<T> | undefined,
  keys: readonly (keyof T)[]
): Partial<T> {
  const fields: Partial<T> = {};
  for (const key of keys) {
    fields[key] = state?.[key];
  }
  return fields;
}
