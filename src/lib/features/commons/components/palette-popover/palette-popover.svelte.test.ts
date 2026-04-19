import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'palette-popover.svelte'),
  'utf8'
);

describe('PalettePopover (Figma 930:114478 + 893:153398 alignment)', () => {
  it('should derive the header title from draftType via a switch on PALETTE_TYPE', () => {
    expect(source).toContain('case PALETTE_TYPE.SEQUENTIAL');
    expect(source).toContain('return m.palette_sequential()');
    expect(source).toContain('case PALETTE_TYPE.DIVERGING');
    expect(source).toContain('return m.palette_diverging()');
    expect(source).toContain('case PALETTE_TYPE.QUALITATIVE');
    expect(source).toContain('return m.color()');
  });

  it('should propagate paletteType from draftType into PaletteCustom and PaletteComparison', () => {
    expect(source).toMatch(/<PaletteCustom[\s\S]*?paletteType={draftType}/);
    expect(source).toMatch(/<PaletteComparison[\s\S]*?paletteType={draftType}/);
  });

  it('should render a Close icon button and a Cancel + Validate footer', () => {
    expect(source).toContain('icon={Close}');
    expect(source).toContain('icon={ArrowRight}');
    expect(source).toContain('{m.button_cancel()}');
    expect(source).toContain('{m.button_validate()}');
  });

  it('should place a divider above the Preview + Footer wrapper', () => {
    expect(source).toContain('popover-divider');
    expect(source).toContain('popover-preview-wrap');
  });

  it('should reverse draft colors when the invert toggle flips on', () => {
    expect(source).toContain('draftColors = [...draftColors].reverse()');
  });
});
