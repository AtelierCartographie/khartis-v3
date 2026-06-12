import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-settings.svelte'),
  'utf8'
);

describe('ProjectionSettings', () => {
  it('disables projection parameters when the current render context cannot apply them', () => {
    expect(source).toContain('const canApplyProjectionSettings = $derived(');
    expect(source).toContain('supportsCustomProjectionCode(projectionContext)');
    expect(source).toContain('{#if !canApplyProjectionSettings}');
    expect(source).toContain('{:else}');
    expect(source).toContain('m.projection_settings_unavailable_title()');
  });

  it('uses committed numeric sliders and guards disabled events from mutating projection state', () => {
    expect(source).toContain(
      "import { Button, InlineNotification } from 'carbon-components-svelte'"
    );
    expect(source).toContain(
      "import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte'"
    );
    expect(source).toContain(
      "import Switch from '$lib/features/commons/components/switch.svelte'"
    );
    expect(source).toContain('if (!canApplyProjectionSettings) return;');
    expect(source).toContain(
      'projectionActions.setCenter(value, projectionState.latitude)'
    );
    expect(source).toContain(
      'projectionActions.setCenter(projectionState.longitude, value)'
    );
    expect(source).toContain('projectionActions.setRotation(value)');
    expect(source).toContain('debounceMs={0}');
  });

  it('delegates reset to the store action that restores the pre-override state', () => {
    expect(source).toContain('projectionActions.resetSettings();');
    expect(source).not.toContain('projectionActions.setSelected(');
    expect(source).not.toContain('projectionActions.setCustomCode(');
  });

  it('places the reset action below the three parameter sliders', () => {
    const rotationSliderIndex = source.indexOf(
      'label={m.projection_settings_rotation()}'
    );
    const resetButtonIndex = source.indexOf(
      'on:click={resetAll}>{m.projection_settings_reset()}</Button'
    );
    const previewToggleIndex = source.indexOf(
      'labelText={m.projection_settings_simplified_preview()}'
    );

    expect(rotationSliderIndex).toBeGreaterThan(-1);
    expect(resetButtonIndex).toBeGreaterThan(rotationSliderIndex);
    expect(resetButtonIndex).toBeLessThan(previewToggleIndex);
    expect(source).not.toContain('<div class="footer">');
  });

  it('exposes the simplified preview toggle because it changes runtime rendering', () => {
    expect(source).toContain('projection_settings_simplified_preview');
    expect(source).toContain('const simplifiedPreview = $derived(');
    expect(source).toContain('projectionState.simplifiedPreview === true');
    expect(source).toContain('projectionActions.setSimplifiedPreview(checked)');
    expect(source).toContain('onchange={handleSimplifiedPreviewChange}');
    expect(source).toContain('{#if simplifiedPreview}');
    expect(source).toContain('m.projection_settings_info_title()');
  });
});
