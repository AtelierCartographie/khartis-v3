import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbol-mode-density.svelte'),
  'utf8'
);

describe('SymbolModeDensity', () => {
  it('routes color selection through SingleColorPreview', () => {
    expect(source).toContain(
      "import SingleColorPreview from '../palette-popover/single-color-preview.svelte'"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).not.toContain('<ColorSelector');
  });

  it('keeps density color changes wired to the density-specific handler', () => {
    expect(source).toContain('onchange={handleFillColorChange}');
  });
});
