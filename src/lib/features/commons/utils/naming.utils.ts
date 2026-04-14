export function generateUniqueNameWithCounter(
  baseName: string,
  existingNames: string[]
): string {
  const baseMatch = baseName.match(/^(.*?)(?:\s*\((\d+)\))?$/);
  const cleanBaseName = baseMatch?.[1]?.trim() || baseName;
  const escapedBaseName = cleanBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const counterPattern = new RegExp(`^${escapedBaseName}\\s*\\((\\d+)\\)$`);

  const existingNumbers: number[] = [];

  for (const name of existingNames) {
    const match = name.match(counterPattern);
    if (match) {
      existingNumbers.push(parseInt(match[1], 10));
    }
  }

  if (existingNumbers.length === 0) {
    const hasExactMatch = existingNames.some(
      (name) => name.toLowerCase() === cleanBaseName.toLowerCase()
    );
    if (hasExactMatch) {
      return `${cleanBaseName} (1)`;
    }
    return cleanBaseName;
  }

  const nextNumber = Math.max(...existingNumbers) + 1;
  return `${cleanBaseName} (${nextNumber})`;
}
