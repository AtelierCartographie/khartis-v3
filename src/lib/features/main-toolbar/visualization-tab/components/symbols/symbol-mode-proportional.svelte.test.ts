import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbol-mode-proportional.svelte'),
  'utf8'
);
const frenchMessages = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../../../../../messages/fr.json'),
    'utf8'
  )
) as Record<string, string>;
const doubleControlsSource = readFileSync(
  resolve(import.meta.dirname, 'proportional/double-mode-controls.svelte'),
  'utf8'
);
const scaleSource = readFileSync(
  resolve(
    import.meta.dirname,
    'proportional/proportional-scale-section.svelte'
  ),
  'utf8'
);
const doubleSource = readFileSync(
  resolve(
    import.meta.dirname,
    'proportional/proportional-double-section.svelte'
  ),
  'utf8'
);

describe('SymbolModeProportional (proportionnels.png + en classes.png)', () => {
  it('uses the FR plural label for the proportional single mode', () => {
    expect(frenchMessages.proportional_type_single).toBe('Uniques');
  });

  it('shows the max-size slider for proportional single and classes modes', () => {
    expect(scaleSource).toContain('label={m.max_size()}');
    expect(source).toContain('{#if symbolMode === SymbolMode.CLASSES}');
    const classesBlock = source.split(
      '{#if symbolMode === SymbolMode.CLASSES}'
    )[1];
    expect(classesBlock).toContain('ProportionalScaleSection');
  });

  it('removes the linear/sqrt/log scale selector from PROPORTIONAL UI', () => {
    expect(source).not.toContain('id="scale-type"');
    expect(source).not.toContain('{m.scale_linear()}');
  });

  it('shows the shape selector with Dropdown in proportional single and classes modes', () => {
    expect(source).not.toContain('items={shapeItems}');
    expect(scaleSource).toContain('items={shapeDropdownItems}');
    expect(scaleSource).toContain('{m.shape()}');
    const classesBlock = source.split(
      '{#if symbolMode === SymbolMode.CLASSES}'
    )[1];
    expect(classesBlock).toContain('ProportionalScaleSection');
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
    expect(source).not.toContain('primitive="symbol"');
    expect(source).toContain('availableModes={FILL_MODES_STANDARD}');
    expect(source).toContain('categoriesVariant="symbols-unique"');
  });

  it('overrides FillMode.UNIQUE with a custom uniqueSnippet for the single color', () => {
    expect(source).toContain('{#snippet uniqueSnippet()}');
    const uniqueSnippet = source
      .split('{#snippet uniqueSnippet()}')[1]
      ?.split('{/snippet}')[0];
    expect(uniqueSnippet).toBeDefined();
    const count = (uniqueSnippet?.match(/<SingleColorPreview/g) ?? []).length;
    expect(count).toBe(1);
    expect(uniqueSnippet).toContain('label={m.color()}');
  });

  it('renders DOUBLE colors outside the shared FillSection', () => {
    const uniqueSnippet = source
      .split('{#snippet uniqueSnippet()}')[1]
      ?.split('{/snippet}')[0];
    expect(uniqueSnippet).not.toContain(
      'symbolMode === SymbolMode.PROPORTIONAL'
    );
    expect(source).toContain(
      'symbolMode === SymbolMode.PROPORTIONAL && proportionalType === ProportionalType.DOUBLE'
    );
    expect(doubleSource).toContain('label={m.symbol_color_a()}');
    expect(doubleSource).toContain('label={m.symbol_color_b()}');
  });

  it('exposes commonScale switch in DOUBLE branch (Figma 697:76546)', () => {
    expect(doubleControlsSource).toContain('m.common_scale_label()');
    expect(doubleControlsSource).toContain('toggled={commonScale}');
    expect(doubleControlsSource).toContain('onchange={onCommonScaleChange}');
  });

  it('renders two FacetsVariablePicker / Dropdown for symbol A and B', () => {
    expect(doubleControlsSource).toContain('m.symbol_a_size_according()');
    expect(doubleControlsSource).toContain('m.symbol_b_size_according()');
  });

  it('exposes max size slider, shape and position dropdown in DOUBLE', () => {
    expect(doubleControlsSource).toContain('label={m.max_size()}');
    expect(doubleControlsSource).toContain('m.symbol_position_mode()');
    expect(doubleControlsSource).toContain('items={positionModeItems}');
  });

  it('exposes bar/spike width control for linear symbol shapes', () => {
    expect(source).toContain('DEFAULT_LINEAR_SYMBOL_BAR_WIDTH');
    expect(source).toContain(
      'const showBarWidthControl = $derived(isLinearShape(shapeType));'
    );
    expect(source).toContain('{#if showBarWidthControl}');
    expect(source).toContain('min={SLIDER_LIMITS.symbolBarWidth.min}');
    expect(source).toContain('onchange={handleBarWidthChange}');
    expect(source).toContain('onSymbolsChange?.({ barWidth: value })');
  });

  it('exposes breakValue A/B TextInputs bound to handleBreakValue*Change', () => {
    expect(doubleControlsSource).toContain('m.symbol_a_break_value()');
    expect(doubleControlsSource).toContain('m.symbol_b_break_value()');
    const doubleBlock = source.split(
      'proportionalType === ProportionalType.DOUBLE'
    )[1];
    expect(doubleBlock).toContain(
      'onBreakValueAChange={handleBreakValueAChange}'
    );
    expect(doubleBlock).toContain(
      'onBreakValueBChange={handleBreakValueBChange}'
    );
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

  it('passes symbol missing-data state to the stroke section', () => {
    const strokeBlock = source.split('<StrokeSection')[1]?.split('/>')[0];
    expect(strokeBlock).toBeDefined();
    expect(strokeBlock).toContain('showMissingData={showMissingData}');
    expect(strokeBlock).toContain('missingDataColor={missingDataColor}');
    expect(strokeBlock).toContain(
      'onMissingDataShowChange={handleMissingDataShowChange}'
    );
    expect(strokeBlock).toContain(
      'onMissingDataColorChange={handleMissingDataColorChange}'
    );
  });

  it('routes FillSection strictly to onClassificationChange (fill role only)', () => {
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toBeDefined();
    expect(fillBlock).toContain(
      'onClassificationChange={onFillClassificationChange'
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

  it('keeps size and fill discretization callbacks separate', () => {
    expect(source).toContain('onsettings={onOpenSizeDiscretization}');
    const fillBlock = source
      .split('<FillSection')[1]
      ?.split('</FillSection>')[0];
    expect(fillBlock).toContain('visualization={fillVisualization}');
    expect(fillBlock).toContain(
      'facetsValueSlotPath={FACET_SLOT.SYMBOL_FILL_VALUE}'
    );
    expect(fillBlock).toContain(
      'facetsCategorySlotPath={FACET_SLOT.SYMBOL_FILL_CATEGORY}'
    );
    expect(fillBlock).toContain(
      'onOpenDiscretization={onOpenFillDiscretization'
    );
  });
});
