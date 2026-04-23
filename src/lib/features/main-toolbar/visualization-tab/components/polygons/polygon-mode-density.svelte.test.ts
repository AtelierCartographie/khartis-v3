import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'polygon-mode-density.svelte'),
  'utf8'
);

describe('PolygonModeDensity', () => {
  it('routes color selection through SingleColorPreview', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).not.toContain('<ColorSelector');
  });

  it('keeps density color changes wired to the density-specific handler', () => {
    expect(source).toContain('onchange={handleFillColorChange}');
  });

  it('writes density settings through the dedicated callback instead of the store', () => {
    expect(source).toContain(
      'onDensityChange?: (updates: Partial<DensityConfig>) => void;'
    );
    expect(source).toContain('onDensityChange?.({ valueColumn: field.text');
    expect(source).toContain('onDensityChange?.({ valueColumn: undefined');
    expect(source).toContain('onDensityChange?.({ level, ratio: option.ratio');
    expect(source).toContain('onDensityChange?.({ dotSize: value })');
    expect(source).toContain('onDensityChange?.({ color: value })');
    expect(source).not.toContain('visualizationStore.updateVisualization');
  });
});
