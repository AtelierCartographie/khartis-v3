import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'single-color-dropdown.svelte'),
  'utf8'
);

describe('SingleColorDropdown (5 presets + Personnaliser)', () => {
  it('should default presets to VIF_MIXTE_COLORS from palette.constants', () => {
    expect(source).toContain('import { VIF_MIXTE_COLORS }');
    expect(source).toContain('presets = VIF_MIXTE_COLORS');
  });

  it('should render one row per preset and highlight the selected one', () => {
    expect(source).toContain('{#each presets as preset');
    expect(source).toContain('class:selected={selectedColor === preset}');
    expect(source).toContain('role="option"');
    expect(source).toContain('aria-selected={selectedColor === preset}');
  });

  it('should emit onselect with the clicked hex and close on selection', () => {
    expect(source).toContain('onclick={() => handleSelect(preset)}');
    expect(source).toContain('onselect?.(hex)');
    expect(source).toContain('open = false');
  });

  it('should render a Personnaliser ghost button with the ColorPalette icon', () => {
    expect(source).toContain('{m.palette_customize()}');
    expect(source).toContain('icon={ColorPalette}');
    expect(source).toContain('on:click={handleCustomize}');
    expect(source).toContain('oncustomize?.()');
  });

  it('should close on Escape and on outside click', () => {
    expect(source).toContain('KEY.ESCAPE');
    expect(source).toContain('handleClose()');
  });
});
