import {
  IGNORED_FILE_PREFIXES,
  SHAPEFILE_EXTENSIONS
} from '$lib/features/commons/constants/ui.constants';
import * as m from '$lib/paraglide/messages';
import { unzip, type Unzipped, type FlateError } from 'fflate';
import { MIME } from '$lib/features/commons/constants';
import { PIPELINE_CONST } from '../constants';
import { getFileExtensionWithDot } from '$lib/features/commons/utils/file.utils';
import { FileType } from '$lib/features/commons/utils/file-import.utils';
import {
  isPipelineError,
  ParseError
} from '$lib/features/commons/pipeline.errors';

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

export function isZipArchiveName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName.endsWith('.zip') || lowerName.endsWith('.kmz');
}

export function isZipFile(file: File): boolean {
  return isZipArchiveName(file.name);
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

function getBaseNameWithoutExtension(name: string): string {
  const ext = getFileExtensionWithDot(name);
  return ext && name.toLowerCase().endsWith(ext)
    ? name.slice(0, name.length - ext.length)
    : name;
}

function isShapefileMemberExtension(ext: string): boolean {
  return (SHAPEFILE_EXTENSIONS as readonly string[]).includes(ext);
}

export async function extractZip(file: File): Promise<ZipExtractionResult> {
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

    const MAX_DECOMPRESSED_SIZE = 500 * 1024 * 1024;
    const maxDecompressedSizeMb = MAX_DECOMPRESSED_SIZE / (1024 * 1024);
    let totalSize = 0;
    const files: ExtractedFile[] = [];

    for (const [path, content] of Object.entries(unzipped)) {
      if (shouldIgnoreFile(path)) continue;
      totalSize += content.byteLength;
      if (totalSize > MAX_DECOMPRESSED_SIZE) {
        throw new ParseError(
          m.error_zip_size_exceeded({
            limit: maxDecompressedSizeMb
          }),
          FileType.ZIP,
          {
            fileName: file.name,
            limitMb: maxDecompressedSizeMb,
            totalSize
          }
        );
      }
      files.push({ name: getFileName(path), path, content });
    }

    const shapefileInfo = detectShapefileInArchive(files);

    return {
      files,
      ...shapefileInfo
    };
  } catch (error) {
    if (isPipelineError(error)) {
      throw error;
    }

    const cause = error instanceof Error ? error.message : String(error);
    throw new ParseError(
      m.pipeline_error_zip_extract_failed({
        error: cause
      }),
      FileType.ZIP,
      {
        cause,
        fileName: file.name
      }
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
    const baseName = getBaseNameWithoutExtension(shpFiles[0].name);
    const hasCompanions = files.some((f) => {
      const ext = getFileExtensionWithDot(f.name);
      return (
        ext !== '.shp' &&
        isShapefileMemberExtension(ext) &&
        getBaseNameWithoutExtension(f.name).toLowerCase() ===
          baseName.toLowerCase()
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

export interface ShapefileBundle {
  baseName: string;
  shp: ExtractedFile;
  companions: ExtractedFile[];
}

export function getShapefileBundlesFromArchive(
  files: ExtractedFile[]
): ShapefileBundle[] {
  return files
    .filter((f) => getFileExtensionWithDot(f.name) === '.shp')
    .map((shp) => {
      const baseName = getBaseNameWithoutExtension(shp.name);
      const companions = getShapefileFilesFromArchive(files, baseName).filter(
        (f) => getFileExtensionWithDot(f.name) !== '.shp'
      );
      return { baseName, shp, companions };
    });
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
    '.csv': MIME.CSV,
    '.tsv': MIME.TSV,
    '.txt': MIME.TEXT,
    '.json': MIME.JSON,
    '.geojson': MIME.GEOJSON,
    '.parquet': MIME.BINARY,
    '.geoparquet': MIME.BINARY,
    '.arrow': MIME.ARROW,
    '.shp': MIME.SHAPEFILE_SHP,
    '.shx': MIME.SHAPEFILE_SHX,
    '.dbf': MIME.SHAPEFILE_DBF,
    '.prj': MIME.SHAPEFILE_PRJ,
    '.cpg': MIME.SHAPEFILE_CPG,
    '.gpkg': MIME.GEOPACKAGE,
    '.kml': MIME.KML,
    '.kmz': MIME.KMZ,
    '.gpx': MIME.GPX
  };
  return mimeTypes[ext] || MIME.BINARY;
}

export function getShapefileFilesFromArchive(
  files: ExtractedFile[],
  baseName: string
): ExtractedFile[] {
  const baseNameLower = baseName.toLowerCase();
  return files.filter((f) => {
    const ext = getFileExtensionWithDot(f.name);
    return (
      isShapefileMemberExtension(ext) &&
      getBaseNameWithoutExtension(f.name).toLowerCase() === baseNameLower
    );
  });
}

export function getSupportedFilesFromArchive(
  files: ExtractedFile[]
): ExtractedFile[] {
  const supportedExtensions = [
    ...PIPELINE_CONST.EXTENSIONS.TABULAR,
    ...PIPELINE_CONST.EXTENSIONS.GEO,
    ...PIPELINE_CONST.EXTENSIONS.PARQUET
  ];

  return files.filter((f) => {
    const ext = getFileExtensionWithDot(f.name);
    return supportedExtensions.includes(
      ext as (typeof supportedExtensions)[number]
    );
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

    if (getBaseNameWithoutExtension(f.name).toLowerCase() === baseNameLower) {
      return !isShapefileMemberExtension(ext);
    }
    return true;
  });
}
