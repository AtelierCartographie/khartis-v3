import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'color-selector.svelte'),
  'utf8'
);

describe('VisualizationTab ColorSelector', () => {
  it('delegates simple color selection to SingleColorPreview', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).toContain('label={label}');
    expect(source).toContain('color={value}');
    expect(source).not.toContain('<ColorPicker');
  });
});
