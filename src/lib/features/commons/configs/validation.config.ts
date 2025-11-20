/**
 * Configuration centralisée pour les limites de validation
 * Évite la duplication des constantes entre validation.utils.ts et file-validator.utils.ts
 */

export interface StorageLimits {
  maxFileSize: number;
  maxProjectSize: number;
  maxProjectCount: number;
  maxStorageSize: number;
  maxTotalFileSize: number;
  maxFileCount: number;
}

/**
 * Limites de stockage et de fichiers pour l'application
 * Tous les fichiers de validation doivent utiliser ces constantes
 */
export const STORAGE_LIMITS: StorageLimits = {
  /** Taille maximale d'un fichier individuel: 50 MB */
  maxFileSize: 50 * 1024 * 1024,

  /** Taille maximale d'un projet complet: 100 MB */
  maxProjectSize: 100 * 1024 * 1024,

  /** Nombre maximal de projets stockés */
  maxProjectCount: 50,

  /** Taille maximale du stockage total: 500 MB */
  maxStorageSize: 500 * 1024 * 1024,

  /** Taille maximale totale de tous les fichiers importés: 100 MB */
  maxTotalFileSize: 100 * 1024 * 1024,

  /** Nombre maximal de fichiers dans une importation */
  maxFileCount: 20
};

/**
 * Interface de base pour les résultats de validation
 * À utiliser comme base pour toutes les validations
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
