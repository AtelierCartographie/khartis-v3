import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'palette-dropdown.svelte'),
  'utf8'
);

describe('PaletteDropdown — compact preview rows', () => {
  it('should accept a previewCount distinct from numClasses', () => {
    expect(source).toContain('previewCount?: number');
    expect(source).toContain('previewCount = numClasses');
  });

  it('should render qualitative previews from palette seed colors', () => {
    expect(source).toContain(
      'function getPalettePreviewColors(palette: Palette)'
    );
    expect(source).toContain('if (palette.type === PALETTE_TYPE.QUALITATIVE)');
    expect(source).toContain('return palette.colors;');
    expect(source).toContain(
      '{#each getPalettePreviewColors(palette) as color, i (i)}'
    );
  });
});
