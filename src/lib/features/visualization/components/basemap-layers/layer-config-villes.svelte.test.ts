import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'layer-config-villes.svelte'),
  'utf8'
);

describe('LayerConfigVilles', () => {
  it('uses SingleColorPreview for the simple color control', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).toContain('color={color}');
    expect(source).not.toContain('<ColorDropdown');
  });

  it('renders the Figma city controls with compact numeric sliders', () => {
    expect(source).toContain('label={m.basemap_config_city_count()}');
    expect(source).toContain('label={m.basemap_config_size()}');
    expect(source).toContain('label={m.basemap_config_opacity()}');
    expect(source.match(/showMinMax/g)).toHaveLength(3);
    expect(source.match(/inputWidth="64px"/g)).toHaveLength(3);
    expect(source.match(/showSteppers={false}/g)).toHaveLength(3);
    expect(source).not.toContain('RadioButtonGroup');
  });

  it('renders the Figma label styling section', () => {
    expect(source).toContain('{m.basemap_config_labels()}');
    expect(source).toContain('titleText={m.basemap_config_label_font()}');
    expect(source).toContain('titleText={m.basemap_config_label_size()}');
    expect(source).toContain('label={m.basemap_config_color()}');
  });
});
