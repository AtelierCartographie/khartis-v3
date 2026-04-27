import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'layer-config-meridiens.svelte'),
  'utf8'
);

describe('LayerConfigMeridiens', () => {
  it('uses SingleColorPreview for the simple color control', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).toContain('color={color}');
    expect(source).not.toContain('<ColorDropdown');
  });

  it('matches the compact Figma slider controls', () => {
    expect(source).toContain('showMinMax');
    expect(source).toContain('inputWidth="64px"');
    expect(source).toContain('showSteppers={false}');
    expect(source).toContain('step={BASEMAP_LAYER_CONFIG.thickness.step}');
  });

  it('exposes the graticule mode and spacing controls', () => {
    expect(source).toContain(
      "import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';"
    );
    expect(source).toContain(
      "import { Star, Wikis } from 'carbon-icons-svelte';"
    );
    expect(source).toContain(
      "import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';"
    );
    expect(source).toContain('<ToggleTabs');
    expect(source).toContain('BasemapGraticuleMode.REMARKABLE');
    expect(source).toContain('BasemapGraticuleMode.REGULAR');
    expect(source).toContain('m.basemap_config_graticule_remarkable()');
    expect(source).toContain('m.basemap_config_graticule_regular()');
    expect(source).toContain('<CompactNumberInput');
    expect(source).toContain('m.basemap_config_spacing_degrees()');
    expect(source).toContain('m.basemap_config_spacing_degrees_decrement()');
    expect(source).toContain('m.basemap_config_spacing_degrees_increment()');
    expect(source).toContain('min={BASEMAP_LAYER_CONFIG.graticuleSpacing.min}');
    expect(source).toContain('max={BASEMAP_LAYER_CONFIG.graticuleSpacing.max}');
    expect(source).toContain('onchange?.({ spacingDegrees: value })');
    expect(source).not.toContain('<Dropdown');
  });
});
