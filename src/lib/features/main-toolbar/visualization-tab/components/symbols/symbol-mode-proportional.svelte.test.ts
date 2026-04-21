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

  it('delegates Fill UI to the shared FillSection with standard modes', () => {
    expect(source).toContain(
      "import FillSection from '../shared/fill-section.svelte'"
    );
    expect(source).toContain('<FillSection');
    expect(source).toContain('primitive="symbol"');
    expect(source).toContain('availableModes={FILL_MODES_STANDARD}');
    expect(source).toContain('categoriesVariant="symbols-unique"');
  });

  it('overrides FillMode.UNIQUE with a custom uniqueSnippet for SINGLE/DOUBLE variants', () => {
    expect(source).toContain('{#snippet uniqueSnippet()}');
    expect(source).toContain('proportionalType === ProportionalType.DOUBLE');
    const uniqueSnippet = source
      .split('{#snippet uniqueSnippet()}')[1]
      ?.split('{/snippet}')[0];
    expect(uniqueSnippet).toBeDefined();
    const count = (uniqueSnippet?.match(/<SingleColorPreview/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
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
    expect(source).toMatch(
      /onSymbolPrimitiveChange\?\.\(\{\s*breakValueA:[\s\S]{0,60}breakValueB:/
    );
  });

  it('E-08: centralises swap logic in a single commitBreakValues helper (no mirrored handlers)', () => {
    expect(source).toMatch(/function commitBreakValues\([\s\S]*?\n {2}\}/);
    const helper = source.match(
      /function commitBreakValues\([\s\S]*?\n {2}\}/
    )?.[0];
    expect(helper).toBeDefined();
    expect(helper).toContain('Number.isFinite(nextA)');
    expect(helper).toContain('Number.isFinite(nextB)');
    expect(helper).toContain('nextA > nextB');
    expect(helper).toContain('breakValueA: finalA');
    expect(helper).toContain('breakValueB: finalB');
  });

  it('E-08: break-value handlers forward to commitBreakValues with the current pair', () => {
    const handlerA = source.match(
      /function handleBreakValueAChange\([\s\S]*?\n {2}\}/
    )?.[0];
    const handlerB = source.match(
      /function handleBreakValueBChange\([\s\S]*?\n {2}\}/
    )?.[0];
    expect(handlerA).toContain('commitBreakValues(value, breakValueB)');
    expect(handlerB).toContain('commitBreakValues(breakValueA, value)');
    expect(handlerA).toContain('isSyncingFromVisualization');
    expect(handlerB).toContain('isSyncingFromVisualization');
  });
});

describe('SymbolModeProportional — anti-leak fill ↔ stroke palette', () => {
  it('routes StrokeSection strictly to onStrokeClassificationChange (no fallback)', () => {
    const strokeBlock = source.split('<StrokeSection')[1]?.split('/>')[0];
    expect(strokeBlock).toBeDefined();
    expect(strokeBlock).toContain(
      'onStrokeClassificationChange={onStrokeClassificationChange'
    );
    expect(strokeBlock).not.toMatch(
      /onStrokeClassificationChange\s*\?\?\s*onClassificationChange/
    );
    expect(strokeBlock).not.toContain(
      'onClassificationChange={onClassificationChange}'
    );
  });

  it('routes FillSection strictly to onClassificationChange (fill role only)', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toBeDefined();
    expect(fillBlock).toContain(
      'onClassificationChange={onClassificationChange'
    );
    expect(fillBlock).not.toContain(
      'onStrokeClassificationChange={onClassificationChange}'
    );
  });
});

describe('SymbolModeProportional — stroke discretization isolation', () => {
  it('wires the stroke section to symbol stroke-specific classification fields', () => {
    expect(source).toContain(
      'strokeClassification={visualization?.symbol?.strokeClassification}'
    );
    expect(source).toContain(
      'strokeValueColumn={visualization?.symbol?.strokeValueColumn}'
    );
    expect(source).toContain(
      'strokeCategoryColumn={visualization?.symbol?.strokeCategoryColumn}'
    );
  });

  it('opens the shared discretization modal in stroke role for the outline channel', () => {
    expect(source).toContain('role="stroke"');
    expect(source).toContain(
      'classification={visualization?.symbol?.strokeClassification}'
    );
    expect(source).toContain(
      'valueColumn={visualization?.symbol?.strokeValueColumn}'
    );
  });
});
