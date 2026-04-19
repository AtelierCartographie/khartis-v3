import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbol-mode-proportional.svelte'),
  'utf8'
);

describe('SymbolModeProportional (proportionnels.png + en classes.png)', () => {
  it('gates the max-size slider on CLASSES mode only', () => {
    expect(source).toContain('{#if symbolMode === SymbolMode.CLASSES}');
    const classesBlock = source.split(
      '{#if symbolMode === SymbolMode.CLASSES}'
    )[1];
    expect(classesBlock).toContain('label={m.max_size()}');
  });

  it('removes the linear/sqrt/log scale selector from PROPORTIONAL UI', () => {
    expect(source).not.toContain('id="scale-type"');
    expect(source).not.toContain('{m.scale_linear()}');
  });

  it('gates the shape selector on CLASSES mode only and uses Dropdown', () => {
    expect(source).not.toContain('items={shapeItems}');
    expect(source).toContain('items={shapeDropdownItems}');
  });

  it('keeps the Uniques/Doubles radio group in PROPORTIONAL', () => {
    expect(source).toContain('id="prop-single"');
    expect(source).toContain('id="prop-double"');
  });

  it('uses MissingDataSection with shape selector and size slider enabled', () => {
    expect(source).toContain('showShapeSelector={true}');
    expect(source).toContain('showSizeSlider={true}');
  });

  it('wires SEQUENTIAL paletteType for the CLASSES fill palette and QUALITATIVE for CATEGORIES', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.SEQUENTIAL}');
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
  });

  it('routes Fill Unique through SingleColorPreview for both SINGLE and DOUBLE variants', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    const uniqueBlock = source
      .split('fillMode === FillMode.UNIQUE')[1]
      ?.split('{:else if')[0];
    // Both SINGLE and DOUBLE branches should use SingleColorPreview
    const count = (uniqueBlock?.match(/<SingleColorPreview/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(uniqueBlock).not.toContain('<ColorSelector');
  });

  it('enables Categories Aspect popover via categoriesMode + categoryLabels on CATEGORIES', () => {
    const categoriesBlock = source.split('fillMode === FillMode.CATEGORIES')[1];
    const paletteBlock = categoriesBlock
      ?.split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(paletteBlock).toContain('categoriesMode={true}');
    expect(paletteBlock).toContain(
      'categoryLabels={visualization?.classification?.labels ?? []}'
    );
  });

  it('exposes commonScale switch in DOUBLE branch (Figma 697:76546)', () => {
    const doubleBlock = source.split(
      'proportionalType === ProportionalType.DOUBLE'
    )[1];
    expect(doubleBlock).toContain('m.common_scale_label()');
    expect(doubleBlock).toContain('toggled={commonScale}');
    expect(doubleBlock).toContain('onchange={handleCommonScaleChange}');
  });

  it('renders two FacetsVariablePicker / Dropdown for symbol A and B', () => {
    const doubleBlock = source.split(
      'proportionalType === ProportionalType.DOUBLE'
    )[1];
    expect(doubleBlock).toContain('m.symbol_a_size_according()');
    expect(doubleBlock).toContain('m.symbol_b_size_according()');
  });

  it('exposes max size slider, shape and position dropdown in DOUBLE', () => {
    const doubleBlock = source.split(
      'proportionalType === ProportionalType.DOUBLE'
    )[1];
    expect(doubleBlock).toContain('label={m.max_size()}');
    expect(doubleBlock).toContain('m.symbol_position_mode()');
    expect(doubleBlock).toContain('items={positionModeItems}');
  });

  it('exposes breakValue A/B TextInputs bound to handleBreakValue*Change', () => {
    const doubleBlock = source.split(
      'proportionalType === ProportionalType.DOUBLE'
    )[1];
    expect(doubleBlock).toContain('m.symbol_a_break_value()');
    expect(doubleBlock).toContain('m.symbol_b_break_value()');
    expect(doubleBlock).toContain('handleBreakValueAChange');
    expect(doubleBlock).toContain('handleBreakValueBChange');
  });

  it('exposes onSymbolPrimitiveChange prop for extended SymbolPrimitiveConfig fields', () => {
    expect(source).toContain('onSymbolPrimitiveChange');
    expect(source).toContain('onSymbolPrimitiveChange?.({ commonScale');
    expect(source).toContain('onSymbolPrimitiveChange?.({ positionMode');
    expect(source).toContain('onSymbolPrimitiveChange?.({ breakValueA');
    expect(source).toContain('onSymbolPrimitiveChange?.({ breakValueB');
  });
});
