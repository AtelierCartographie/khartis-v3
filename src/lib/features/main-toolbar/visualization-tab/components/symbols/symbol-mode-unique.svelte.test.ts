import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbol-mode-unique.svelte'),
  'utf8'
);

describe('SymbolModeUnique (aucun.png alignment)', () => {
  it('renders shape selector as Dropdown, not ToggleTabs', () => {
    expect(source).toContain('<Dropdown');
    expect(source).toContain('items={shapeDropdownItems}');
    expect(source).not.toContain('items={shapeItems}');
  });

  it('uses the shape label key for the Forme field', () => {
    expect(source).toContain('{m.shape()}');
  });

  it('binds the size slider to symbolSize limits', () => {
    expect(source).toContain('min={SLIDER_LIMITS.symbolSize.min}');
    expect(source).toContain('max={SLIDER_LIMITS.symbolSize.max}');
  });

  it('still exposes the background (Fond) section to match existing feature set', () => {
    expect(source).toContain('title={m.background()}');
  });

  it('wires SEQUENTIAL paletteType for CLASSES fill and QUALITATIVE for CATEGORIES fill', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.SEQUENTIAL}');
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
  });

  it('routes Fill Unique through SingleColorPreview (not ColorSelector)', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    const uniqueBlock = source
      .split('fillMode === FillMode.UNIQUE')[1]
      ?.split('{:else if')[0];
    expect(uniqueBlock).toContain('<SingleColorPreview');
    expect(uniqueBlock).not.toContain('<ColorSelector');
  });

  it('enables the Categories Aspect popover via categoriesMode + categoryLabels on CATEGORIES', () => {
    const categoriesBlock = source.split('fillMode === FillMode.CATEGORIES')[1];
    const paletteBlock = categoriesBlock
      ?.split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(paletteBlock).toContain('categoriesMode={true}');
    expect(paletteBlock).toContain(
      'categoryLabels={visualization?.classification?.labels ?? []}'
    );
  });
});
