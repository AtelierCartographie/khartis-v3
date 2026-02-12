import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  FileProcessor,
  FileProcessorRegistration,
  ProcessContext
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
