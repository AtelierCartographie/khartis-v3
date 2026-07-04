import { m } from '$lib/paraglide/messages';

export function slugify(text: string): string {
  if (!text) return '';

  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s\-_.]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function generateFilename(
  name: string,
  extension: string,
  includeTimestamp: boolean = true
): string {
  const slugifiedName = slugify(name || m.untitled_file());

  if (includeTimestamp) {
    const timestamp = new Date().toISOString().slice(0, 10);
    return `${slugifiedName}-${timestamp}.${extension}`;
  }

  return `${slugifiedName}.${extension}`;
}

export function generateProjectFilename(
  projectName: string,
  extension: string = 'kh'
): string {
  return generateFilename(projectName || m.untitled_project(), extension, true);
}

export function sanitizeDisplayName(filename: string): string {
  if (!filename) return '';

  const pathSeparators = /[/\\]/;
  const parts = filename.split(pathSeparators);
  return parts[parts.length - 1];
}
