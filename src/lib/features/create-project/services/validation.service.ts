import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  showError,
  showWarning
} from '$lib/features/commons/utils/notification.utils.svelte';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiresAsyncValidation?: boolean;
}

export interface MultiFileValidationResult {
  isValid: boolean;
  globalErrors: string[];
  results: Map<string, ValidationResult>;
}

export class CreateProjectValidationService {
  static validateFiles(files: File[]): MultiFileValidationResult {
    const result = FileValidator.validateMultiple(files);

    if (result.globalErrors.length > 0) {
      logger.error(
        'Global file validation failed',
        LogCategory.FILE,
        result.globalErrors
      );
      showError('Erreur de validation globale', result.globalErrors.join(', '));
    }

    for (const [filename, fileResult] of result.results) {
      if (!fileResult.isValid) {
        logger.error('File validation failed', LogCategory.FILE, {
          filename,
          errors: fileResult.errors
        });
        showError(
          `Erreur avec le fichier ${filename}`,
          fileResult.errors.join(', ')
        );
      }

      if (fileResult.warnings.length > 0) {
        logger.warn('File validation warnings', LogCategory.FILE, {
          filename,
          warnings: fileResult.warnings
        });
        showWarning('Avertissements', fileResult.warnings.join(', '));
      }
    }

    return result;
  }

  static validateURL(url: string): ValidationResult {
    const result = FileValidator.validateURL(url);

    if (!result.isValid) {
      logger.error('URL validation failed', LogCategory.FILE, {
        url,
        errors: result.errors
      });
      showError('URL invalide', result.errors.join(', '));
    }

    if (result.warnings.length > 0) {
      logger.warn('URL validation warnings', LogCategory.FILE, {
        url,
        warnings: result.warnings
      });
      showWarning('Avertissement URL', result.warnings.join(', '));
    }

    return result;
  }

  static validateProjectName(name: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push('Le nom du projet est requis');
    }

    if (name.trim().length > 100) {
      errors.push('Le nom du projet est trop long (max 100 caractères)');
    }

    const invalidChars = /[<>:"/\\|?*]/g;
    if (invalidChars.test(name)) {
      errors.push('Le nom contient des caractères non autorisés');
    }

    if (name.trim().length < 3) {
      warnings.push('Le nom du projet est très court');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateKhartisFiles(files: File[]): File[] {
    const validFiles: File[] = [];
    let hasErrors = false;

    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension !== 'kh' && extension !== 'khartis') {
        continue;
      }

      if (file.size === 0) {
        showError('Le fichier est vide', '');
        hasErrors = true;
        continue;
      }

      if (file.size > 100 * 1024 * 1024) {
        showError('Le fichier dépasse la taille limite (100MB)', '');
        hasErrors = true;
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0 && files.length > 0 && !hasErrors) {
      showError('Format de fichier invalide', '');
    }

    return validFiles;
  }

  static validatePastedData(text: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!text || text.trim().length === 0) {
      errors.push('Aucune donnée collée');
      return { isValid: false, errors, warnings };
    }

    if (text.length > 10 * 1024 * 1024) {
      errors.push('Les données collées sont trop volumineuses');
    }

    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      warnings.push('Peu de lignes détectées');
    }

    const firstLine = lines[0];
    const separators = [',', ';', '\t', '|'];
    const detectedSeparator = separators.find((sep) => firstLine.includes(sep));

    if (!detectedSeparator) {
      warnings.push('Aucun séparateur détecté');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
