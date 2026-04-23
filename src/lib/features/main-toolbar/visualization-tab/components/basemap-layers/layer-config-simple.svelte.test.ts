import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'layer-config-simple.svelte'),
  'utf8'
);

describe('LayerConfigSimple', () => {
  it('uses the shared unique-color control for simple color inputs', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).toContain('color={color}');
    expect(source).not.toContain('<ColorDropdown');
  });
});
