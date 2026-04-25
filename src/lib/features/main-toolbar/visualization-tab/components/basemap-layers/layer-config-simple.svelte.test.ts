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

  it('renders compact Figma-style sliders for basemap numeric controls', () => {
    expect(source.match(/showMinMax/g)).toHaveLength(2);
    expect(source.match(/inputWidth="64px"/g)).toHaveLength(2);
    expect(source.match(/showSteppers={false}/g)).toHaveLength(2);
    expect(source).toContain(
      'thicknessStep = BASEMAP_LAYER_CONFIG.thickness.step'
    );
    expect(source).toContain('step={thicknessStep}');
  });
});
