import type { UploadedFile } from '$lib/features/commons/stores/create-project.types';

export type ImportFileLike = Pick<UploadedFile, 'status' | 'validation'>;
