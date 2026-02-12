import * as m from '$lib/paraglide/messages';
import localforage from 'localforage';
import { STORAGE_LIMITS } from '../configs/validation.config';
import { LogCategory, logger } from './logger';
import { estimateProjectStorageSize } from './size-estimation.utils';

export type { ValidationResult } from '$lib/features/data-pipeline/types';
export {
  validationSuccess,
  validationFailure,
  mergeValidationResults
} from '$lib/features/data-pipeline/types';

import type { ValidationResult } from '$lib/features/data-pipeline/types';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

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
        m.validation_file_exceeds_limit({
          name: file.name,
          limit: String(STORAGE_LIMITS.maxFileSize / (1024 * 1024))
        })
      );
    }

    if (file.size > STORAGE_LIMITS.maxFileSize * 0.8) {
      result.warnings.push(
        m.validation_file_large_performance({ name: file.name })
      );
    }

    return result;
  },

  validateProjectSize(projectData: unknown): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const projectSize = estimateProjectStorageSize(projectData);

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
              : JSON.stringify(value, bigIntReplacer).length) + key.length;
        }
      }

      const sizeInBytes = totalSize * 2;

      if (sizeInBytes > STORAGE_LIMITS.maxStorageSize) {
        result.warnings.push(m.validation_storage_approaching_limit());
      }

      if (sizeInBytes > STORAGE_LIMITS.maxStorageSize * 0.9) {
        result.isValid = false;
        result.errors.push(m.validation_storage_insufficient());
      }
    } catch (error) {
      logger.error('Failed to check storage usage', LogCategory.STORE, error);
      result.warnings.push(m.validation_storage_check_failed());
    }

    return result;
  }
} as const;

export const DataValidator = {
  validateCSVData(data: Record<string, unknown>[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!Array.isArray(data)) {
      result.isValid = false;
      result.errors.push(m.validation_csv_must_be_array());
      return result;
    }

    if (data.length === 0) {
      result.isValid = false;
      result.errors.push(m.validation_csv_empty());
      return result;
    }

    if (data.length > 100000) {
      result.warnings.push(m.validation_csv_too_many_rows());
    }

    const firstRow = data[0];
    if (!firstRow || Object.keys(firstRow).length === 0) {
      result.isValid = false;
      result.errors.push(m.validation_csv_no_columns());
      return result;
    }

    if (Object.keys(firstRow).length > 1000) {
      result.warnings.push(m.validation_csv_too_many_columns());
    }

    return result;
  },

  validateGeoData(data: unknown): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!data || typeof data !== 'object') {
      result.isValid = false;
      result.errors.push(m.validation_geo_invalid());
      return result;
    }

    const geo = data as { type?: string; features?: unknown[] };

    if (geo.type === 'FeatureCollection') {
      if (!Array.isArray(geo.features)) {
        result.isValid = false;
        result.errors.push(m.validation_geo_feature_collection_invalid());
        return result;
      }

      if (geo.features.length === 0) {
        result.isValid = false;
        result.errors.push(m.validation_geo_no_features());
      }

      if (geo.features.length > 50000) {
        result.warnings.push(m.validation_geo_too_many_features());
      }
    }

    return result;
  }
} as const;
