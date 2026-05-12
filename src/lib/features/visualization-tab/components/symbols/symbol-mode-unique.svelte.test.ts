import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLIDER_LIMITS } from '$lib/features/commons/constants/visualization.constants';

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
    expect(SLIDER_LIMITS.symbolSize.max).toBe(100);
  });

  it('delegates the background fill rendering to the shared FillSection', () => {
    expect(source).toContain(
      "import FillSection from '../shared/fill-section.svelte'"
    );
    expect(source).toContain('<FillSection');
    expect(source).not.toContain('primitive="symbol"');
  });

  it('uses the standard 4-mode preset (no DENSITY for symbols unique)', () => {
    expect(source).toContain('availableModes={FILL_MODES_STANDARD}');
    expect(source).toContain(
      "import { FILL_MODES_STANDARD } from '../shared/fill-mode-presets'"
    );
  });

  it('passes the background section title to FillSection', () => {
    const fillBlock = source.split('<FillSection')[1]?.split('/>')[0];
    expect(fillBlock).toContain('sectionTitle={m.background()}');
  });

  it('sets categoriesVariant to symbols-unique', () => {
    const fillBlock = source.split('<FillSection')[1]?.split('/>')[0];
    expect(fillBlock).toContain('categoriesVariant="symbols-unique"');
  });
});

describe('SymbolModeUnique — anti-leak fill ↔ stroke palette', () => {
  it('routes StrokeSection strictly to onStrokeClassificationChange (no fallback to onClassificationChange)', () => {
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

  it('routes FillSection strictly to onClassificationChange (fill role)', () => {
    const fillBlock = source.split('<FillSection')[1]?.split('/>')[0];
    expect(fillBlock).toBeDefined();
    expect(fillBlock).toContain(
      'onClassificationChange={onFillClassificationChange'
    );
    expect(fillBlock).not.toContain(
      'onStrokeClassificationChange={onClassificationChange}'
    );
  });

  it('imports FillSection and StrokeSection as separate components (distinct roles)', () => {
    expect(source).toContain(
      "import FillSection from '../shared/fill-section.svelte'"
    );
    expect(source).toContain('StrokeSection');
  });
});

describe('SymbolModeUnique — stroke discretization isolation', () => {
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
    expect(source).toContain('const strokeDiscretizationLabel = $derived.by');
    expect(source).toContain('discretizationLabel={strokeDiscretizationLabel}');
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

  it('binds FillSection to the dedicated symbol fill visualization and facet slots', () => {
    const fillBlock = source.split('<FillSection')[1]?.split('/>')[0];
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
