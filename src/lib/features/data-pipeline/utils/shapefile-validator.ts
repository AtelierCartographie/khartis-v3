import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';

export interface ShapefileValidation {
  isComplete: boolean;
  baseName: string;
  presentFiles: string[];
  requiredMissing: string[];
  optionalMissing: string[];
  hasMinimumRequired: boolean;
}

const REQUIRED_EXTENSIONS = ['.shp', '.shx', '.dbf'] as const;
const OPTIONAL_EXTENSIONS = [
  '.prj',
  '.cpg',
  '.sbn',
  '.sbx',
  '.fbn',
  '.fbx',
  '.ain',
  '.aih',
  '.ixs',
  '.mxs',
  '.atx',
  '.xml'
] as const;

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}

function getBaseName(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  const name = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function isShapefileComponent(filename: string): boolean {
  const ext = getFileExtension(filename);
  return [...REQUIRED_EXTENSIONS, ...OPTIONAL_EXTENSIONS].includes(
    ext as (typeof REQUIRED_EXTENSIONS)[number]
  );
}

export function detectShapefileBaseName(files: File[]): string | null {
  for (const file of files) {
    const ext = getFileExtension(file.name);
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

  const presentExtensions = matchingFiles.map((f) => getFileExtension(f.name));

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

export function groupShapefileComponents(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();

  for (const file of files) {
    if (!isShapefileComponent(file.name)) continue;

    const baseName = getBaseName(file.name).toLowerCase();
    const existing = groups.get(baseName) ?? [];
    existing.push(file);
    groups.set(baseName, existing);
  }

  return groups;
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

export function getShapefileFiles(files: File[], baseName: string): File[] {
  const baseNameLower = baseName.toLowerCase();
  return files.filter((f) => {
    const fileBaseName = getBaseName(f.name).toLowerCase();
    return fileBaseName === baseNameLower && isShapefileComponent(f.name);
  });
}
