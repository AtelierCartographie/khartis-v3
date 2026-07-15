import {
  CSV_DELIMITERS,
  FILE_ENCODING,
  FILE_EXTENSION_GROUPS
} from '$lib/features/commons/constants/file-types.constants';

export const PIPELINE_CONST = {
  EXTENSIONS: FILE_EXTENSION_GROUPS,
  QUALITY: {
    HIGH_NULL_RATIO_THRESHOLD: 0.5,
    LOW_CARDINALITY_THRESHOLD: 0.01
  },
  CSV: {
    SUPPORTED_DELIMITERS: CSV_DELIMITERS.SUPPORTED,
    DEFAULT_DELIMITER: CSV_DELIMITERS.DEFAULT
  },
  ENCODING: FILE_ENCODING
} as const;

export function isGeospatialFile(name: string): boolean {
  const lower = name.toLowerCase();
  return PIPELINE_CONST.EXTENSIONS.GEO.some((ext) => lower.endsWith(ext));
}
