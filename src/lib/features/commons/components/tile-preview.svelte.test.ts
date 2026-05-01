import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'tile-preview.svelte'),
  'utf8'
);

describe('TilePreview', () => {
  it('lets parent cards override preview colors for hover states', () => {
    expect(source).toContain('--tile-preview-default-background');
    expect(source).toContain('--tile-preview-default-color');
    expect(source).not.toContain(
      '.tile-preview.suggestion {\n    --tile-preview-background'
    );
  });

  it('supports a neutral non-cartographic glyph for projection previews', () => {
    expect(source).toContain("icon?: 'earth' | 'palette' | 'none';");
    expect(source).toContain('class="neutral-preview-glyph"');
  });
});
