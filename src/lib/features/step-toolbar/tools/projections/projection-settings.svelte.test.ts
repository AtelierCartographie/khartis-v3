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
    expect(source).toContain('disabled={!canApplyProjectionSettings}');
    expect(source).toContain('m.projection_settings_unavailable_title()');
  });

  it('uses carbon sliders and guards disabled events from mutating projection state', () => {
    expect(source).toContain(
      "import { Button, InlineNotification, Slider } from 'carbon-components-svelte'"
    );
    expect(source).toContain(
      "import Switch from '$lib/features/commons/components/switch.svelte'"
    );
    expect(source).toContain('if (!canApplyProjectionSettings) return;');
    expect(source).toContain(
      'projectionActions.setCenter(event.detail, projectionState.latitude)'
    );
    expect(source).toContain(
      'projectionActions.setCenter(projectionState.longitude, event.detail)'
    );
    expect(source).toContain('projectionActions.setRotation(event.detail)');
  });

  it('keeps reset scoped to center and rotation values', () => {
    expect(source).toContain('projectionActions.setCenter(0, 0);');
    expect(source).toContain('projectionActions.setRotation(0);');
    expect(source).not.toContain('projectionActions.setSelected(');
    expect(source).not.toContain('projectionActions.setCustomCode(');
  });

  it('exposes the simplified preview toggle because it changes runtime rendering', () => {
    expect(source).toContain('projection_settings_simplified_preview');
    expect(source).toContain('const simplifiedPreview = $derived(');
    expect(source).toContain('projectionActions.setSimplifiedPreview(checked)');
    expect(source).toContain('onchange={handleSimplifiedPreviewChange}');
    expect(source).toContain(
      '{#if canApplyProjectionSettings && simplifiedPreview}'
    );
    expect(source).toContain('m.projection_settings_info_title()');
  });
});
