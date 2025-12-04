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
  const slugifiedName = slugify(name || 'untitled');

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
  return generateFilename(projectName || 'untitled-project', extension, true);
}

export function sanitizeDisplayName(filename: string): string {
  if (!filename) return '';

  const pathSeparators = /[/\\]/;
  const parts = filename.split(pathSeparators);
  return parts[parts.length - 1];
}

/**
 * Normalise une chaîne pour la comparaison (enlève accents, espaces, ponctuation)
 * Utilisé pour le matching de données géographiques
 * @param value La chaîne à normaliser
 * @param caseSensitive Si vrai, conserve la casse (défaut: false)
 * @returns La chaîne normalisée
 */
export function normalizeForMatching(
  value: string,
  caseSensitive: boolean = false
): string {
  if (!value) return '';

  let normalized = value.toString().trim();

  // Remove accents using NFD + diacritics removal
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Apply case if necessary
  if (!caseSensitive) {
    normalized = normalized.toLowerCase();
  }

  // Remove punctuation and special characters (keep letters, digits and spaces)
  normalized = normalized.replace(/[^a-z0-9\s]/gi, '');

  // Normalize multiple spaces into one
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
