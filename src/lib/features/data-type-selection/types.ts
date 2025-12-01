import type { FileType } from '$lib/features/commons/store/create-project.types';

export type DataRole = 'tabular' | 'geographic';

export interface DataRoleAssignment {
  fileId: string;
  fileName: string;
  fileType: FileType;
  assignedRole: DataRole;
}

export interface DataTypeSelectionState {
  assignments: DataRoleAssignment[];
  confirmed: boolean;
}

export const TABULAR_FILE_TYPES: FileType[] = ['csv', 'tsv'] as FileType[];

export const GEOGRAPHIC_FILE_TYPES: FileType[] = [
  'geojson',
  'shapefile',
  'geopackage',
  'geoparquet',
  'kml',
  'kmz'
] as FileType[];

export function isTabularFileType(fileType: FileType): boolean {
  return TABULAR_FILE_TYPES.includes(fileType);
}

export function isGeographicFileType(fileType: FileType): boolean {
  return GEOGRAPHIC_FILE_TYPES.includes(fileType);
}

export function getDefaultRole(fileType: FileType): DataRole {
  return isTabularFileType(fileType) ? 'tabular' : 'geographic';
}
