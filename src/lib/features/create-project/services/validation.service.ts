import { STORAGE_LIMITS } from '$lib/features/commons/constants/validation.config';
import { extractUrlsFromInput } from '$lib/features/commons/utils/file-import.utils';
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import type { ValidationResult } from '$lib/features/commons/types/validation.types';
import * as m from '$lib/paraglide/messages';

interface MultiFileValidationResult {
  isValid: boolean;
  globalErrors: string[];
  results: Map<string, ValidationResult>;
}

function validateFiles(files: File[]): MultiFileValidationResult {
  const result = FileValidator.validateMultiple(files);

  return result;
}

function validateURL(urlInput: string): ValidationResult {
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
        errors.push(`${url}${m.separator_em_dash()}${error}`);
      });
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach((warning) => {
        warnings.push(`${url}${m.separator_em_dash()}${warning}`);
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

function validateProjectName(name: string): ValidationResult {
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

function validateKhartisFiles(files: File[]): File[] {
  const validFiles: File[] = [];

  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension !== 'kh' && extension !== 'khartis') {
      continue;
    }

    if (file.size === 0) {
      continue;
    }

    if (file.size > STORAGE_LIMITS.maxFileSize) {
      continue;
    }

    validFiles.push(file);
  }

  return validFiles;
}

function validatePastedData(text: string): ValidationResult {
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

export const CreateProjectValidationService = {
  validateFiles,
  validateURL,
  validateProjectName,
  validateKhartisFiles,
  validatePastedData
};
