import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import type { FileProcessor } from './file-processor.interface';

const processors: FileProcessor[] = [];

export function registerProcessor(processor: FileProcessor): void {
  processors.push(processor);
}

export function getProcessor(file: UploadedFile): FileProcessor | null {
  return processors.find((processor) => processor.canHandle(file)) ?? null;
}
