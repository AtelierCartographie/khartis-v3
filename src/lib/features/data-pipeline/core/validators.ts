import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { PIPELINE_CONST } from '../constants';
import type { ValidationResult } from '../types';
import { validationFailure, validationSuccess } from '../types';

export async function validateFile(file: File): Promise<ValidationResult> {
  const { MAX_FILE_SIZE } = PIPELINE_CONST.LIMITS;

  if (file.size === 0) {
    logger.warn('Uploaded file is empty', LogCategory.DATA, {
      fileName: file.name
    });
    return validationFailure(['File is empty']);
  }

  if (file.size > MAX_FILE_SIZE) {
    logger.warn('Uploaded file exceeds size limit', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size,
      maxSize: MAX_FILE_SIZE
    });
    return validationFailure([
      `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
    ]);
  }

  logger.debug('File passed basic validation', LogCategory.DATA, {
    fileName: file.name,
    fileSize: file.size
  });

  return validationSuccess();
}

export function validateFileExtension(
  file: File,
  allowedExtensions: string[]
): ValidationResult {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (!allowedExtensions.includes(ext)) {
    return validationFailure([`Unsupported file extension: ${ext}`]);
  }
  return validationSuccess();
}

export function validateMimeType(
  file: File,
  allowedMimeTypes: string[]
): ValidationResult {
  if (!allowedMimeTypes.some((mime) => file.type.includes(mime))) {
    return validationFailure([`Unsupported MIME type: ${file.type}`]);
  }
  return validationSuccess();
}
