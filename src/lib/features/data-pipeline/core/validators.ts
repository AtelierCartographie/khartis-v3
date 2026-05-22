import {
  getMaxFileSizeForType,
  getWarningFileSizeForType
} from '$lib/features/commons/constants/validation.config';
import { detectFileType } from '$lib/features/commons/utils/file-import.utils';
import * as m from '$lib/paraglide/messages';
import { PIPELINE_CONST } from '../constants';
import type { ValidationResult } from '../types';
import { validationFailure, validationSuccess } from '../types';

export async function validateFile(file: File): Promise<ValidationResult> {
  const fileType = detectFileType(file);
  const maxFileSize = getMaxFileSizeForType(fileType);
  const warningFileSize = getWarningFileSizeForType(fileType);

  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (
    !PIPELINE_CONST.EXTENSIONS.ALL.includes(
      ext as (typeof PIPELINE_CONST.EXTENSIONS.ALL)[number]
    )
  ) {
    return validationFailure([m.pipeline_error_unsupported_extension({ ext })]);
  }

  if (file.size === 0) {
    return validationFailure([m.pipeline_error_file_empty()]);
  }

  if (file.size > maxFileSize) {
    return validationFailure([
      m.pipeline_error_file_size_limit({
        limit: String(maxFileSize / (1024 * 1024))
      })
    ]);
  }

  const warnings: string[] = [];
  if (file.size > warningFileSize) {
    warnings.push(
      m.pipeline_warning_large_file({
        size: (file.size / (1024 * 1024)).toFixed(1)
      })
    );
  }

  return validationSuccess(warnings);
}
