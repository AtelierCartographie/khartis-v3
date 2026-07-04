import {
  FILE_EXTENSIONS,
  MIME_TYPE_PATTERNS
} from '$lib/features/commons/constants';
import { FileType } from '../types/create-project.types';
import { getFileExtension } from './file.utils';

const TABULAR_TEXT_EXTENSION = 'txt';

export const SHAPEFILE_AUX_EXTENSIONS = ['sbn', 'sbx'] as const;

export function detectFileType(file: Pick<File, 'name' | 'type'>): FileType {
  const extension = getFileExtension(file.name);
  const mimeType = file.type?.toLowerCase() || '';
  const hasExtension = <T extends readonly string[]>(values: T): boolean =>
    values.includes(extension as T[number]);
  const hasMimePattern = (pattern: string): boolean =>
    mimeType.includes(pattern);

  if (
    hasExtension(FILE_EXTENSIONS.CSV) ||
    hasMimePattern(MIME_TYPE_PATTERNS.CSV)
  ) {
    return FileType.CSV;
  }
  if (
    hasExtension(FILE_EXTENSIONS.TSV) ||
    hasMimePattern(MIME_TYPE_PATTERNS.TAB_SEPARATED)
  ) {
    return FileType.TSV;
  }
  if (
    extension === TABULAR_TEXT_EXTENSION &&
    !hasMimePattern(FILE_EXTENSIONS.GEOJSON[1])
  ) {
    return FileType.CSV;
  }

  if (
    hasExtension(FILE_EXTENSIONS.GEOJSON) ||
    hasMimePattern('geo+json') ||
    hasMimePattern(FILE_EXTENSIONS.GEOJSON[1])
  ) {
    return FileType.GEOJSON;
  }

  if (
    hasExtension(FILE_EXTENSIONS.SHAPEFILE) ||
    SHAPEFILE_AUX_EXTENSIONS.includes(
      extension as (typeof SHAPEFILE_AUX_EXTENSIONS)[number]
    )
  ) {
    return FileType.SHAPEFILE;
  }

  if (
    hasExtension(FILE_EXTENSIONS.GEOPACKAGE) ||
    hasMimePattern('geopackage')
  ) {
    return FileType.GEOPACKAGE;
  }

  if (
    hasExtension(FILE_EXTENSIONS.GEOPARQUET) ||
    hasMimePattern(MIME_TYPE_PATTERNS.PARQUET)
  ) {
    return FileType.GEOPARQUET;
  }

  if (hasExtension(FILE_EXTENSIONS.ARROW) || hasMimePattern('arrow')) {
    return FileType.ARROW;
  }

  if (hasExtension(FILE_EXTENSIONS.KML) || hasMimePattern('kml')) {
    return FileType.KML;
  }
  if (hasExtension(FILE_EXTENSIONS.KMZ) || hasMimePattern('kmz')) {
    return FileType.KMZ;
  }
  if (hasExtension(FILE_EXTENSIONS.GPX) || hasMimePattern('gpx')) {
    return FileType.GPX;
  }
  if (
    hasExtension(FILE_EXTENSIONS.ZIP) ||
    hasMimePattern(MIME_TYPE_PATTERNS.ZIP)
  ) {
    return FileType.ZIP;
  }

  return FileType.UNKNOWN;
}
