import {
  getBaseName,
  getFileExtensionWithDot
} from '$lib/features/commons/utils/file.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import { PIPELINE_CONST } from '../constants';

export interface ShapefileValidation {
  isComplete: boolean;
  baseName: string;
  presentFiles: string[];
  requiredMissing: string[];
  optionalMissing: string[];
  hasMinimumRequired: boolean;
}

const REQUIRED_EXTENSIONS = PIPELINE_CONST.EXTENSIONS.SHAPEFILE_REQUIRED;
const OPTIONAL_EXTENSIONS = PIPELINE_CONST.EXTENSIONS.SHAPEFILE_OPTIONAL;

export function isShapefileComponent(filename: string): boolean {
  const ext = getFileExtensionWithDot(filename);
  return [...REQUIRED_EXTENSIONS, ...OPTIONAL_EXTENSIONS].includes(
    ext as (typeof REQUIRED_EXTENSIONS)[number]
  );
}

export function detectShapefileBaseName(files: File[]): string | null {
  for (const file of files) {
    const ext = getFileExtensionWithDot(file.name);
    if (ext === '.shp') {
      return getBaseName(file.name);
    }
  }
  return null;
}

export function validateShapefileSet(
  files: File[]
): ShapefileValidation | null {
  const baseName = detectShapefileBaseName(files);

  if (!baseName) {
    return null;
  }

  const baseNameLower = baseName.toLowerCase();
  const matchingFiles = files.filter((f) => {
    const fileBaseName = getBaseName(f.name).toLowerCase();
    return fileBaseName === baseNameLower && isShapefileComponent(f.name);
  });

  const presentExtensions = matchingFiles.map((f) =>
    getFileExtensionWithDot(f.name)
  );

  const requiredMissing = REQUIRED_EXTENSIONS.filter(
    (ext) => !presentExtensions.includes(ext)
  );

  const optionalMissing = OPTIONAL_EXTENSIONS.filter(
    (ext) => !presentExtensions.includes(ext)
  );

  const isComplete = requiredMissing.length === 0;
  const hasMinimumRequired = presentExtensions.includes('.shp');

  logger.debug('Shapefile validation result', LogCategory.DATA, {
    baseName,
    presentFiles: presentExtensions,
    requiredMissing,
    optionalMissing,
    isComplete
  });

  return {
    isComplete,
    baseName,
    presentFiles: presentExtensions,
    requiredMissing,
    optionalMissing: optionalMissing.slice(0, 4),
    hasMinimumRequired
  };
}

export function getShapefileValidationMessage(
  validation: ShapefileValidation
): {
  type: 'error' | 'warning' | 'info';
  message: string;
} {
  if (validation.isComplete) {
    return {
      type: 'info',
      message: m.pipeline_info_shp_complete({ baseName: validation.baseName })
    };
  }

  if (!validation.hasMinimumRequired) {
    return {
      type: 'error',
      message: m.pipeline_error_shp_missing({ baseName: validation.baseName })
    };
  }

  if (validation.requiredMissing.length > 0) {
    const missing = validation.requiredMissing.join(', ');
    return {
      type: 'warning',
      message: m.pipeline_warning_shp_incomplete({ missing })
    };
  }

  return {
    type: 'info',
    message: m.pipeline_info_shp_ready({
      baseName: validation.baseName,
      optional: validation.optionalMissing.join(', ')
    })
  };
}

export function canProcessShapefile(validation: ShapefileValidation): boolean {
  return (
    validation.hasMinimumRequired && validation.requiredMissing.length === 0
  );
}
