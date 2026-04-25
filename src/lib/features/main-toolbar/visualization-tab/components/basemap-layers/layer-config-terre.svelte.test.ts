import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'layer-config-terre.svelte'),
  'utf8'
);

describe('LayerConfigTerre', () => {
  it('uses SingleColorPreview for the fill color control', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).toContain('label={m.basemap_config_color()}');
    expect(source).toContain('color={fillColor}');
  });

  it('uses SingleColorPreview for the stroke color control as well', () => {
    expect(source).toContain('color={strokeColor}');
    expect(source).not.toContain('<ColorDropdown');
  });

  it('uses the shared subpixel thickness step for strokes', () => {
    expect(source).toContain('step={BASEMAP_LAYER_CONFIG.thickness.step}');
  });
});
