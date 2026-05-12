import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import ImageTool from './image-tool.svelte';
import { annotationsActions } from './annotations.store.svelte';
import { isSupportedAnnotationImageFile } from './image-file-validation';

describe('image annotation tool', () => {
  beforeEach(() => {
    annotationsActions.reset();
  });

  it('limits image imports to the CDC-supported JPG and PNG formats', () => {
    const { container } = render(ImageTool);
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(fileInput).toBeInTheDocument();
    expect(fileInput?.getAttribute('accept')).toBe('.jpg,.jpeg,.png');
  });

  it('rejects unsupported annotation image files before placement', () => {
    expect(
      isSupportedAnnotationImageFile({
        name: 'map.svg',
        type: 'image/svg+xml'
      })
    ).toBe(false);
    expect(
      isSupportedAnnotationImageFile({
        name: 'photo.webp',
        type: 'image/webp'
      })
    ).toBe(false);
  });

  it('accepts JPG and PNG annotation images by MIME type or extension fallback', () => {
    expect(
      isSupportedAnnotationImageFile({ name: 'photo.jpeg', type: 'image/jpeg' })
    ).toBe(true);
    expect(
      isSupportedAnnotationImageFile({ name: 'map.png', type: 'image/png' })
    ).toBe(true);
    expect(
      isSupportedAnnotationImageFile({ name: 'PHOTO.JPG', type: '' })
    ).toBe(true);
  });
});
