import * as m from '$lib/paraglide/messages';
import {
  STORAGE_LIMITS,
  getMaxFileSizeForType,
  getWarningFileSizeForType
} from '../constants/validation.config';
import { detectFileType } from './file-import.utils';

import type { ValidationResult } from '../types/validation.types';

export const ProjectValidator = {
  validateFileSize(file: File): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const fileType = detectFileType(file);
    const maxFileSize = getMaxFileSizeForType(fileType);
    const warningFileSize = getWarningFileSizeForType(fileType);

    if (file.size > maxFileSize) {
      result.isValid = false;
      result.errors.push(
        m.validation_file_exceeds_limit({
          name: file.name,
          limit: String(maxFileSize / (1024 * 1024))
        })
      );
    }

    if (file.size > warningFileSize) {
      result.warnings.push(
        m.validation_file_large_performance({ name: file.name })
      );
    }

    return result;
  },

  validateProjectSize(projectSize: number): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (projectSize > STORAGE_LIMITS.maxProjectSize) {
      result.isValid = false;
      result.errors.push(
        m.validation_project_exceeds_size({
          limit: String(STORAGE_LIMITS.maxProjectSize / (1024 * 1024))
        })
      );
    }

    if (projectSize > STORAGE_LIMITS.maxProjectSize * 0.8) {
      result.warnings.push(m.validation_project_size_performance());
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
      result.errors.push(m.validation_project_name_required());
      return result;
    }

    if (name.length > 255) {
      result.isValid = false;
      result.errors.push(m.validation_project_name_max_chars());
    }

    const invalidChars = /[<>:"/\\|?*]/g;
    if (invalidChars.test(name)) {
      result.isValid = false;
      result.errors.push(m.validation_project_name_invalid_chars());
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
        m.validation_project_count_limit({
          limit: String(STORAGE_LIMITS.maxProjectCount)
        })
      );
    }

    if (currentProjectCount >= STORAGE_LIMITS.maxProjectCount * 0.8) {
      result.warnings.push(
        m.validation_project_count_approaching({
          limit: String(STORAGE_LIMITS.maxProjectCount)
        })
      );
    }

    return result;
  }
} as const;
