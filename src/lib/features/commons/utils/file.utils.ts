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

export function replaceFileExtension(
  filename: string,
  extension: string
): string {
  const normalizedExtension = extension.startsWith('.')
    ? extension
    : `.${extension}`;
  const baseName = filename.replace(/\.[^.]+$/u, '');
  return `${baseName}${normalizedExtension}`;
}
