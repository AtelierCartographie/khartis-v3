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

  // Enlever les accents en utilisant NFD + suppression des diacritiques
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Appliquer la casse si nécessaire
  if (!caseSensitive) {
    normalized = normalized.toLowerCase();
  }

  // Enlever la ponctuation et caractères spéciaux (garder lettres, chiffres et espaces)
  normalized = normalized.replace(/[^a-z0-9\s]/gi, '');

  // Normaliser les espaces multiples en un seul
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
