/**
 * Utilitaires de validation pour une app client-side
 * Simplifié car tout s'exécute localement
 */

/**
 * Nettoie les noms de projets - évite les caractères problématiques pour l'export
 */
export function sanitizeProjectName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Enlève les caractères qui peuvent poser problème dans les noms de fichiers
  let sanitized = name.replace(/[<>:"/\\|?*]/g, '');

  // Limite la longueur
  sanitized = sanitized.substring(0, 100);

  // Normalise les espaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Nettoie les noms de fichiers pour l'export
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return '';
  }

  // Enlève les caractères interdits dans les noms de fichiers
  let sanitized = fileName.replace(/[<>:"/\\|?*]/g, '_');

  // Enlève les points au début (fichiers cachés)
  sanitized = sanitized.replace(/^\.+/, '');

  // Limite la longueur
  sanitized = sanitized.substring(0, 255);

  return sanitized;
}

/**
 * Valide les entrées numériques pour éviter NaN/Infinity
 */
export function sanitizeNumericInput(input: string | number): number {
  if (typeof input === 'number') {
    if (!isFinite(input) || isNaN(input)) {
      return 0;
    }
    return input;
  }

  if (typeof input === 'string') {
    const parsed = parseFloat(input);
    if (isNaN(parsed) || !isFinite(parsed)) {
      return 0;
    }
    return parsed;
  }

  return 0;
}

/**
 * Protège contre l'injection de formules CSV
 * Important si l'utilisateur exporte et ouvre dans Excel
 */
export function sanitizeCSVCell(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  // Préfixe les cellules qui peuvent être interprétées comme formules
  const dangerousStarts = ['=', '+', '-', '@', '\t', '\r'];

  if (dangerousStarts.some(char => value.startsWith(char))) {
    return "'" + value;
  }

  return value;
}

/**
 * Simple sanitisation de texte - juste pour éviter les problèmes d'affichage
 */
export function sanitizeTextInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Juste normaliser les espaces et limiter la longueur
  return input.replace(/\s+/g, ' ').trim().substring(0, 500);
}