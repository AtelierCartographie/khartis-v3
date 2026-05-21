import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'single-color-preview.svelte'),
  'utf8'
);

describe('SingleColorPreview (Fill Unique trigger)', () => {
  it('should render a color swatch + ChevronDown trigger button', () => {
    expect(source).toContain('class="color-swatch"');
    expect(source).toContain('<ChevronDown size={16}');
    expect(source).toContain('aria-label={m.color()}');
    expect(source).toContain('aria-expanded={dropdownOpen}');
  });

  it('should open SingleColorDropdown on click and expose Personnaliser', () => {
    expect(source).toContain('<SingleColorDropdown');
    expect(source).toContain('oncustomize={handleCustomize}');
    expect(source).toContain('dropdownOpen = !dropdownOpen');
  });

  it('should open PalettePopover in QUALITATIVE mode with numClasses=1 on Personnaliser', () => {
    expect(source).toContain('<PalettePopover');
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
    expect(source).toContain('numClasses={1}');
    expect(source).toContain('currentColors={[color]}');
  });

  it('should propagate validated color back via onchange(hex)', () => {
    expect(source).toContain('const hex = newColors[0]');
    expect(source).toContain('onchange?.(hex)');
  });

  it('should propagate validated motif settings for unique polygon fills', () => {
    expect(source).toContain('patternId?: string;');
    expect(source).toContain('onpatternchange?:');
    expect(source).toContain('const nextPatternId = palette?.patternId');
    expect(source).toContain('onpatternchange?.(');
    expect(source).toContain(
      "selectedPaletteId={patternId ? `pattern-${patternId}` : '__custom__'}"
    );
  });
});
