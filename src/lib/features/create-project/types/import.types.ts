import type { UploadedFile } from '$lib/features/commons/types/create-project.types';

export type ImportFileLike = Pick<UploadedFile, 'status' | 'validation'>;
