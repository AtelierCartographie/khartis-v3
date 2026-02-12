import {
  IGNORED_FILE_PREFIXES,
  SHAPEFILE_EXTENSIONS
} from '$lib/features/commons/constants/ui.constants';
import { getFileExtensionWithDot } from '$lib/features/commons/utils/file.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import { unzip, type Unzipped, type FlateError } from 'fflate';

export interface ExtractedFile {
  name: string;
  path: string;
  content: Uint8Array;
}

export interface ZipExtractionResult {
  files: ExtractedFile[];
  isShapefileArchive: boolean;
  shapefileBaseName?: string;
}

export function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip');
}

function shouldIgnoreFile(path: string): boolean {
  const pathParts = path.split('/');
  return (
    pathParts.some((part) =>
      IGNORED_FILE_PREFIXES.some((prefix) => part.startsWith(prefix))
    ) || path.endsWith('/')
  );
}

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

export async function extractZip(file: File): Promise<ZipExtractionResult> {
  const start = performance.now();

  logger.info('Extracting ZIP archive', LogCategory.DATA, {
    fileName: file.name,
    fileSize: file.size
  });

  try {
    const buffer = await file.arrayBuffer();
    const unzipped = await new Promise<Unzipped>((resolve, reject) => {
      unzip(
        new Uint8Array(buffer),
        (err: FlateError | null, data: Unzipped) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });

    const files: ExtractedFile[] = Object.entries(unzipped)
      .filter(([path]) => !shouldIgnoreFile(path))
      .map(([path, content]) => ({
        name: getFileName(path),
        path,
        content
      }));

    const shapefileInfo = detectShapefileInArchive(files);

    logger.success('ZIP archive extracted', LogCategory.DATA, {
      fileName: file.name,
      extractedFiles: files.length,
      isShapefileArchive: shapefileInfo.isShapefileArchive,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return {
      files,
      ...shapefileInfo
    };
  } catch (error) {
    logger.error('Failed to extract ZIP archive', LogCategory.DATA, {
      fileName: file.name,
      error
    });
    throw new Error(
      m.pipeline_error_zip_extract_failed({
        error: error instanceof Error ? error.message : String(error)
      }),
      { cause: error }
    );
  }
}

function detectShapefileInArchive(files: ExtractedFile[]): {
  isShapefileArchive: boolean;
  shapefileBaseName?: string;
} {
  const shpFiles = files.filter((f) => f.name.toLowerCase().endsWith('.shp'));

  if (shpFiles.length === 0) {
    return { isShapefileArchive: false };
  }

  if (shpFiles.length === 1) {
    const baseName = shpFiles[0].name.replace(/\.shp$/i, '');
    const hasCompanions = files.some((f) => {
      const ext = getFileExtensionWithDot(f.name);
      return (
        ext !== '.shp' &&
        (SHAPEFILE_EXTENSIONS as readonly string[]).includes(ext) &&
        f.name.replace(ext, '').toLowerCase() === baseName.toLowerCase()
      );
    });

    if (hasCompanions) {
      return {
        isShapefileArchive: true,
        shapefileBaseName: baseName
      };
    }
  }

  return { isShapefileArchive: false };
}

export function createFileFromExtracted(
  extracted: ExtractedFile,
  mimeType?: string
): File {
  const ext = getFileExtensionWithDot(extracted.name);
  const detectedMime = mimeType || getMimeTypeForExtension(ext);
  const arrayBuffer = extracted.content.buffer.slice(
    extracted.content.byteOffset,
    extracted.content.byteOffset + extracted.content.byteLength
  ) as ArrayBuffer;
  return new File([arrayBuffer], extracted.name, { type: detectedMime });
}

function getMimeTypeForExtension(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.geojson': 'application/geo+json',
    '.parquet': 'application/octet-stream',
    '.geoparquet': 'application/octet-stream',
    '.arrow': 'application/vnd.apache.arrow.file',
    '.shp': 'application/x-shapefile',
    '.shx': 'application/octet-stream',
    '.dbf': 'application/x-dbf',
    '.prj': 'text/plain',
    '.cpg': 'text/plain',
    '.gpkg': 'application/geopackage+sqlite3',
    '.kml': 'application/vnd.google-earth.kml+xml',
    '.kmz': 'application/vnd.google-earth.kmz',
    '.gpx': 'application/gpx+xml'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function getShapefileFilesFromArchive(
  files: ExtractedFile[],
  baseName: string
): ExtractedFile[] {
  const baseNameLower = baseName.toLowerCase();
  return files.filter((f) => {
    const ext = getFileExtensionWithDot(f.name);
    const fileBaseName = f.name.replace(ext, '').toLowerCase();
    return (
      (SHAPEFILE_EXTENSIONS as readonly string[]).includes(ext) &&
      fileBaseName === baseNameLower
    );
  });
}

export function getSupportedFilesFromArchive(
  files: ExtractedFile[]
): ExtractedFile[] {
  const supportedExtensions = [
    '.csv',
    '.tsv',
    '.txt',
    '.json',
    '.geojson',
    '.parquet',
    '.geoparquet',
    '.arrow',
    '.gpkg',
    '.kml',
    '.kmz',
    '.gpx'
  ];

  return files.filter((f) => {
    const ext = getFileExtensionWithDot(f.name);
    return supportedExtensions.includes(ext);
  });
}

export function getNonShapefileFilesFromArchive(
  files: ExtractedFile[],
  shapefileBaseName?: string
): ExtractedFile[] {
  const supportedFiles = getSupportedFilesFromArchive(files);
  if (!shapefileBaseName) return supportedFiles;

  const baseNameLower = shapefileBaseName.toLowerCase();

  return supportedFiles.filter((f) => {
    const ext = getFileExtensionWithDot(f.name);
    const fileBaseName = f.name.replace(ext, '').toLowerCase();

    if (fileBaseName === baseNameLower) {
      return !(SHAPEFILE_EXTENSIONS as readonly string[]).includes(ext);
    }
    return true;
  });
}
