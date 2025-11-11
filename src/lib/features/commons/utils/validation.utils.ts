import localforage from 'localforage';
import {
  STORAGE_LIMITS,
  type ValidationResult,
  type StorageLimits
} from '../configs/validation.config';

// Re-export pour compatibilité avec le code existant
export { STORAGE_LIMITS, type ValidationResult, type StorageLimits };

export const ProjectValidator = {
  validateFileSize(file: File): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (file.size > STORAGE_LIMITS.maxFileSize) {
      result.isValid = false;
      result.errors.push(
        `Le fichier ${file.name} dépasse la limite de ${STORAGE_LIMITS.maxFileSize / (1024 * 1024)} MB`
      );
    }

    if (file.size > STORAGE_LIMITS.maxFileSize * 0.8) {
      result.warnings.push(
        `Le fichier ${file.name} est volumineux et pourrait affecter les performances`
      );
    }

    return result;
  },

  validateProjectSize(projectData: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const projectSize = new Blob([JSON.stringify(projectData)]).size;

    if (projectSize > STORAGE_LIMITS.maxProjectSize) {
      result.isValid = false;
      result.errors.push(
        `Le projet dépasse la limite de ${STORAGE_LIMITS.maxProjectSize / (1024 * 1024)} MB`
      );
    }

    if (projectSize > STORAGE_LIMITS.maxProjectSize * 0.8) {
      result.warnings.push(
        'Le projet est volumineux et pourrait affecter les performances'
      );
    }

    return result;
  },

  validateProjectName(name: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!name || name.trim().length === 0) {
      result.isValid = false;
      result.errors.push('Le nom du projet est requis');
      return result;
    }

    if (name.length > 255) {
      result.isValid = false;
      result.errors.push(
        'Le nom du projet ne peut pas dépasser 255 caractères'
      );
    }

    const invalidChars = /[<>:"/\\|?*]/g;
    if (invalidChars.test(name)) {
      result.isValid = false;
      result.errors.push('Le nom du projet contient des caractères invalides');
    }

    return result;
  },

  validateStorageCapacity(currentProjectCount: number): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (currentProjectCount >= STORAGE_LIMITS.maxProjectCount) {
      result.isValid = false;
      result.errors.push(
        `Limite de ${STORAGE_LIMITS.maxProjectCount} projets atteinte. Veuillez supprimer des projets existants.`
      );
    }

    if (currentProjectCount >= STORAGE_LIMITS.maxProjectCount * 0.8) {
      result.warnings.push(
        `Vous approchez de la limite de ${STORAGE_LIMITS.maxProjectCount} projets`
      );
    }

    return result;
  },

  async checkStorageUsage(): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      let totalSize = 0;
      const keys = await localforage.keys();

      for (const key of keys) {
        const value = await localforage.getItem<string>(key);
        if (value) {
          totalSize +=
            (typeof value === 'string'
              ? value.length
              : JSON.stringify(value).length) + key.length;
        }
      }

      const sizeInBytes = totalSize * 2;

      if (sizeInBytes > STORAGE_LIMITS.maxStorageSize) {
        result.warnings.push(
          'Le stockage approche de sa limite. Certaines fonctionnalités pourraient être affectées.'
        );
      }

      if (sizeInBytes > STORAGE_LIMITS.maxStorageSize * 0.9) {
        result.isValid = false;
        result.errors.push(
          'Espace de stockage insuffisant. Veuillez nettoyer le cache du navigateur.'
        );
      }
    } catch (_error) {
      result.warnings.push("Impossible de vérifier l'utilisation du stockage");
    }

    return result;
  },

  sanitizeProjectName(name: string): string {
    return name
      .trim()
      .replace(/[<>:"/\\|?*]/g, '_')
      .substring(0, 255);
  }
} as const;

export const DataValidator = {
  validateCSVData(data: any[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!Array.isArray(data)) {
      result.isValid = false;
      result.errors.push('Les données doivent être un tableau');
      return result;
    }

    if (data.length === 0) {
      result.isValid = false;
      result.errors.push('Le fichier est vide');
      return result;
    }

    if (data.length > 100000) {
      result.warnings.push(
        'Le fichier contient plus de 100 000 lignes. Les performances pourraient être affectées.'
      );
    }

    const firstRow = data[0];
    if (!firstRow || Object.keys(firstRow).length === 0) {
      result.isValid = false;
      result.errors.push('Aucune colonne détectée dans le fichier');
      return result;
    }

    if (Object.keys(firstRow).length > 1000) {
      result.warnings.push(
        'Le fichier contient plus de 1000 colonnes. Cela pourrait affecter les performances.'
      );
    }

    return result;
  },

  validateGeoData(data: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!data) {
      result.isValid = false;
      result.errors.push('Données géographiques invalides');
      return result;
    }

    if (data.type === 'FeatureCollection') {
      if (!data.features || !Array.isArray(data.features)) {
        result.isValid = false;
        result.errors.push('FeatureCollection invalide : features manquantes');
        return result;
      }

      if (data.features.length === 0) {
        result.isValid = false;
        result.errors.push('Aucune entité géographique trouvée');
      }

      if (data.features.length > 50000) {
        result.warnings.push(
          'Plus de 50 000 entités géographiques. Les performances pourraient être affectées.'
        );
      }
    }

    return result;
  }
} as const;
