import type { UploadedFile } from '$lib/features/commons/stores/create-project.types';

export interface ProcessingCallbacks {
  onProgress: (fileId: string, progress: number) => void;
  onStatusChange: (
    fileId: string,
    status: UploadedFile['status'],
    errorMessage?: string
  ) => void;
  onDataUpdate: (fileId: string, data: Partial<UploadedFile>) => void;
  onAdditionalFile?: (file: UploadedFile) => void;
}

export interface FileProcessorService {
  processFile: (uploadedFile: UploadedFile, file: File) => Promise<void>;
}
