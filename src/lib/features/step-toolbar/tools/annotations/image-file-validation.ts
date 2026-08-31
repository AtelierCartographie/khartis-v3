export const SUPPORTED_ANNOTATION_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png'
] as const;

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

export const MAX_ANNOTATION_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

export function isSupportedAnnotationImageFile(
  file: Pick<File, 'name' | 'type'>
): boolean {
  const mimeType = file.type.trim().toLowerCase();
  if (mimeType) {
    return SUPPORTED_IMAGE_TYPES.has(mimeType);
  }

  const name = file.name.trim().toLowerCase();
  return SUPPORTED_ANNOTATION_IMAGE_EXTENSIONS.some((extension) =>
    name.endsWith(extension)
  );
}

export function isAnnotationImageFileSizeAllowed(
  file: Pick<File, 'size'>
): boolean {
  return file.size <= MAX_ANNOTATION_IMAGE_SIZE_BYTES;
}
