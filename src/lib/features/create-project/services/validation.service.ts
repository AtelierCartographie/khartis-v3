import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import { extractUrlsFromInput } from '$lib/features/commons/utils/file-import.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';

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
    }

    for (const [filename, fileResult] of result.results) {
      if (!fileResult.isValid) {
        logger.error('File validation failed', LogCategory.FILE, {
          filename,
          errors: fileResult.errors
        });
      }

      if (fileResult.warnings.length > 0) {
        logger.warn('File validation warnings', LogCategory.FILE, {
          filename,
          warnings: fileResult.warnings
        });
      }
    }

    return result;
  }

  static validateURL(urlInput: string): ValidationResult {
    const urls = extractUrlsFromInput(urlInput);
    if (urls.length === 0) {
      return {
        isValid: false,
        errors: [m.validation_url_required()],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    urls.forEach((url) => {
      const result = FileValidator.validateURL(url);

      if (!result.isValid) {
        result.errors.forEach((error) => {
          errors.push(`${url} — ${error}`);
        });
      }

      if (result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          warnings.push(`${url} — ${warning}`);
        });
      }
    });

    if (errors.length > 0) {
      logger.error('URL validation failed', LogCategory.FILE, {
        urls,
        errors
      });
    }

    if (warnings.length > 0) {
      logger.warn('URL validation warnings', LogCategory.FILE, {
        urls,
        warnings
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateProjectName(name: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push(m.validation_project_name_required());
    }

    if (name.trim().length > 100) {
      errors.push(m.validation_project_name_too_long());
    }

    const invalidChars = /[<>:"/\\|?*]/g;
    if (invalidChars.test(name)) {
      errors.push(m.validation_project_name_invalid_chars());
    }

    if (name.trim().length < 3) {
      warnings.push(m.validation_project_name_too_short());
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
        hasErrors = true;
        continue;
      }

      if (file.size > 100 * 1024 * 1024) {
        hasErrors = true;
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0 && files.length > 0 && !hasErrors) {
      logger.error('No valid files', LogCategory.FILE);
    }

    return validFiles;
  }

  static validatePastedData(text: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!text || text.trim().length === 0) {
      errors.push(m.validation_pasted_data_empty());
      return { isValid: false, errors, warnings };
    }

    if (text.length > 10 * 1024 * 1024) {
      errors.push(m.validation_pasted_data_too_large());
    }

    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      warnings.push(m.validation_pasted_data_few_lines());
    }

    const firstLine = lines[0];
    const separators = [',', ';', '\t', '|'];
    const detectedSeparator = separators.find((sep) => firstLine.includes(sep));

    if (!detectedSeparator) {
      warnings.push(m.validation_pasted_data_no_separator());
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
