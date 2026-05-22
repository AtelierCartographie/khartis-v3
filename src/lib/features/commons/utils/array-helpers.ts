export function findById<T extends { id: string }>(
  array: T[],
  id: string | undefined
): T | undefined {
  if (!id) return undefined;
  return array.find((item) => item.id === id);
}

export function updateById<T extends { id: string }>(
  array: T[],
  id: string,
  updates: Partial<T>
): T[] {
  const found = array.some((item) => item.id === id);
  if (!found) return array;
  return array.map((item) => (item.id === id ? { ...item, ...updates } : item));
}

export function removeById<T extends { id: string }>(
  array: T[],
  id: string
): T[] {
  return array.filter((item) => item.id !== id);
}

export function replaceAtIndex<T>(array: T[], index: number, newItem: T): T[] {
  if (index < 0 || index >= array.length) {
    throw new Error(
      `replaceAtIndex: index ${index} out of bounds for array of length ${array.length}`
    );
  }
  return [...array.slice(0, index), newItem, ...array.slice(index + 1)];
}
