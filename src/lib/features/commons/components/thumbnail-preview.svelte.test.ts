import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'thumbnail-preview.svelte'),
  'utf8'
);

describe('ThumbnailPreview', () => {
  it('keeps loaded thumbnails on a white surface independent from card hover tokens', () => {
    expect(source).toContain('.thumbnail-preview {');
    expect(source).toContain('background: #ffffff;');
    expect(source).toContain('.thumbnail-image {');
    expect(source).toContain('object-fit: contain;');
  });
});
