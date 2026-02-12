export function getFileExtension(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot + 1).toLowerCase() : '';
}

export function getFileExtensionWithDot(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}

export function getBaseName(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  const name = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
