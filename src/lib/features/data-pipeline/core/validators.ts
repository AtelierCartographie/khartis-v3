import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import { PIPELINE_CONST } from '../constants';
import type { ValidationResult } from '../types';
import { validationFailure, validationSuccess } from '../types';

export async function validateFile(file: File): Promise<ValidationResult> {
  const { MAX_FILE_SIZE, WARNING_FILE_SIZE } = PIPELINE_CONST.LIMITS;

  if (file.size === 0) {
    logger.warn('Uploaded file is empty', LogCategory.DATA, {
      fileName: file.name
    });
    return validationFailure([m.pipeline_error_file_empty()]);
  }

  if (file.size > MAX_FILE_SIZE) {
    logger.warn('Uploaded file exceeds size limit', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size,
      maxSize: MAX_FILE_SIZE
    });
    return validationFailure([
      m.pipeline_error_file_size_limit({ limit: String(MAX_FILE_SIZE / (1024 * 1024)) })
    ]);
  }

  const warnings: string[] = [];
  if (file.size > WARNING_FILE_SIZE) {
    logger.info('Large file detected', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size,
      warningThreshold: WARNING_FILE_SIZE
    });
    warnings.push(
      m.pipeline_warning_large_file({ size: (file.size / (1024 * 1024)).toFixed(1) })
    );
  }

  logger.debug('File passed basic validation', LogCategory.DATA, {
    fileName: file.name,
    fileSize: file.size
  });

  return validationSuccess(warnings);
}

export function validateFileExtension(
  file: File,
  allowedExtensions: string[]
): ValidationResult {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (!allowedExtensions.includes(ext)) {
    return validationFailure([m.pipeline_error_unsupported_extension({ ext })]);
  }
  return validationSuccess();
}

export function validateMimeType(
  file: File,
  allowedMimeTypes: string[]
): ValidationResult {
  if (!allowedMimeTypes.some((mime) => file.type.includes(mime))) {
    return validationFailure([m.pipeline_error_unsupported_mime({ type: file.type })]);
  }
  return validationSuccess();
}
