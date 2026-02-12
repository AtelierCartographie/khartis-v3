import { ParseError } from '$lib/features/commons/errors/pipeline.errors';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';

export function isTabularData(
  data: unknown
): data is Record<string, unknown>[] {
  return Array.isArray(data) && data.every((item) => typeof item === 'object');
}

export function convertToCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];
  csvRows.push(headers.join(','));

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

export function getFileForDuckDB(
  file: UploadedFile,
  fallbackMime: string
): File {
  if (file.originalFile) {
    return file.originalFile;
  }

  if (file.content instanceof ArrayBuffer) {
    return new File([file.content], file.name, { type: fallbackMime });
  }

  if (typeof file.content === 'string') {
    return new File([file.content], file.name, { type: fallbackMime });
  }

  throw new ParseError(
    'Missing original file content for DuckDB ingestion',
    file.fileType,
    { fileId: file.id, fileName: file.name }
  );
}

export async function getArrayBuffer(file: UploadedFile): Promise<ArrayBuffer> {
  if (file.originalFile) {
    return file.originalFile.arrayBuffer();
  }

  if (file.content instanceof ArrayBuffer) {
    return file.content;
  }

  if (typeof file.content === 'string') {
    return new TextEncoder().encode(file.content).buffer;
  }

  throw new ParseError('Missing file content for processing', file.fileType, {
    fileId: file.id,
    fileName: file.name
  });
}
