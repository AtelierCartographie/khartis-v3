import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  FileProcessor,
  FileProcessorRegistration,
  ProcessContext,
  ProcessorDataset
} from './file-processor.interface';

export type { ProcessContext };

const processors: FileProcessorRegistration[] = [];

export function registerProcessor(
  processor: FileProcessor,
  priority = 0
): void {
  processors.push({ processor, priority });
  processors.sort((a, b) => b.priority - a.priority);

  logger.debug('Registered file processor', LogCategory.DATA, {
    supportedTypes: processor.supportedFileTypes,
    priority,
    totalProcessors: processors.length
  });
}

export function getProcessor(file: UploadedFile): FileProcessor | null {
  for (const registration of processors) {
    if (registration.processor.canHandle(file)) {
      return registration.processor;
    }
  }
  return null;
}

export function hasProcessor(file: UploadedFile): boolean {
  return getProcessor(file) !== null;
}

export async function processWithRegistry(
  ctx: ProcessContext,
  file: UploadedFile
): Promise<ProcessorDataset> {
  const processor = getProcessor(file);

  if (!processor) {
    throw new Error(
      `No processor found for file type: ${file.fileType} (${file.name})`
    );
  }

  logger.debug('Processing file with registry', LogCategory.DATA, {
    fileType: file.fileType,
    fileName: file.name,
    processorTypes: processor.supportedFileTypes
  });

  return processor.process(ctx, file);
}
