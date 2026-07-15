import { ParseError } from '$lib/features/commons/pipeline.errors';
import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import * as m from '$lib/paraglide/messages';
import type {
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';

export async function buildProcessorDataset(
  ctx: ProcessContext,
  file: UploadedFile,
  actualTableName: string
): Promise<ProcessorDataset> {
  const [columns, rowCount] = await Promise.all([
    ctx.Duck.analyse(actualTableName),
    ctx.callbacks.getRowCount(actualTableName)
  ]);

  return {
    id: file.datasetId ?? file.id,
    tableName: actualTableName,
    sourceFileId: file.id,
    name: file.name,
    columns,
    rowCount,
    metadata: { processedAt: new Date(), fileType: file.fileType },
    geoDetection: file.deepAnalysis?.geoDetection
  };
}

export function isTabularData(
  data: unknown
): data is Record<string, unknown>[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((item) => typeof item === 'object' && item !== null)
  );
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
      if (typeof value === 'string' && /[,"\n\r]/.test(value)) {
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

  throw new ParseError(m.error_missing_file_content_duckdb(), file.fileType, {
    fileId: file.id,
    fileName: file.name
  });
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

  throw new ParseError(m.error_missing_file_content(), file.fileType, {
    fileId: file.id,
    fileName: file.name
  });
}
