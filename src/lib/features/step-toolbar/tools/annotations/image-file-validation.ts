export const SUPPORTED_ANNOTATION_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png'
] as const;

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

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
