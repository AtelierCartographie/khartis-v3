import * as m from '$lib/paraglide/messages';
import { FILE_EXTENSIONS, FileStatus } from '$lib/features/commons/constants';
import {
  FILE_ENCODING,
  TABULAR_DELIMITERS
} from '$lib/features/commons/constants/file-types.constants';
import { ParseError } from '../pipeline.errors';
import {
  type UploadedFile,
  DataSourceType,
  FileType
} from '../types/create-project.types';
import { detectFileType } from './file-type-detection.utils';
import { sanitizeDisplayName } from './string.utils';

const UTF8_ENCODING = FILE_ENCODING.DEFAULT;
const HTTP_PROTOCOL = 'http:';
const HTTPS_PROTOCOL = 'https:';
const DEFAULT_FILENAME = 'download';

export type ColumnStatSummary = {
  type: string;
  count: number;
  nullCount: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
};

export { DataSourceType, FileType } from '../types/create-project.types';
export { formatFileSize } from './format.utils';
export { detectFileType } from './file-type-detection.utils';

export function isShapefileComponent(filename: string): boolean {
  const extension = filename.toLowerCase().split('.').pop() || '';
  return FILE_EXTENSIONS.SHAPEFILE.includes(extension as never);
}

export function getShapefileBaseName(filename: string): string {
  const parts = filename.split('.');
  parts.pop();
  return parts.join('.');
}

export function groupShapefiles(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();

  files.forEach((file) => {
    if (isShapefileComponent(file.name)) {
      const baseName = getShapefileBaseName(file.name);
      if (!groups.has(baseName)) {
        groups.set(baseName, []);
      }
      groups.get(baseName)!.push(file);
    } else {
      groups.set(file.name, [file]);
    }
  });

  return groups;
}

export async function readFileContent(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result) {
        if (onProgress) onProgress(100);
        resolve(reader.result);
      } else {
        reject(
          new ParseError(m.error_file_read_failed(), detectFileType(file))
        );
      }
    };

    reader.onerror = () => {
      reject(new ParseError(m.error_file_read_failed(), detectFileType(file)));
    };

    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    };

    const fileType = detectFileType(file);
    if (fileType === FileType.CSV || fileType === FileType.GEOJSON) {
      reader.readAsText(file, UTF8_ENCODING);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

export function createUploadedFile(
  file: File,
  sourceType: DataSourceType,
  relatedFiles?: string[]
): UploadedFile {
  const cleanName = sanitizeDisplayName(file.name);

  return {
    id: crypto.randomUUID(),
    name: cleanName,
    size: file.size,
    type: file.type,
    fileType: detectFileType(file),
    status: FileStatus.UPLOADING,
    sourceType,
    relatedFiles,
    uploadProgress: 0
  };
}

export function extractDataFromPaste(pastedText: string): {
  fileType: FileType;
  content: string;
} | null {
  if (!pastedText.trim()) return null;

  const content = pastedText
    .replace(/^(?:\r?\n)+/, '')
    .replace(/(?:\r?\n)+$/, '');
  const firstLine = content.split(/\r?\n/)[0];
  const hasDelimiter = TABULAR_DELIMITERS.some((d) => firstLine.includes(d));

  if (!hasDelimiter) return null;

  const tabCount = (firstLine.match(/\t/g) || []).length;
  const fileType = tabCount > 0 ? FileType.TSV : FileType.CSV;

  return { fileType, content };
}

export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === HTTP_PROTOCOL ||
      parsedUrl.protocol === HTTPS_PROTOCOL
    );
  } catch {
    return false;
  }
}

export function extractUrlsFromInput(input: string): string[] {
  return input
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function getFilenameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const filename = pathname.split('/').pop() || DEFAULT_FILENAME;
    return filename;
  } catch {
    return DEFAULT_FILENAME;
  }
}
