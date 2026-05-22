import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbols-config.svelte'),
  'utf8'
);

describe('SymbolsConfig container', () => {
  it('offers the four symbol modes without density (moved to polygons)', () => {
    expect(source).toContain('m.symbol_mode_unique()');
    expect(source).toContain('m.symbol_mode_proportional()');
    expect(source).toContain('m.symbol_mode_classes()');
    expect(source).toContain('m.symbol_mode_categories()');
    expect(source).not.toContain('SymbolModeDensity');
    expect(source).not.toContain('SymbolMode.DENSITY');
  });

  it('derives the active symbol mode from the canonical primitive config', () => {
    expect(source).toContain('getSymbolPrimitive(visualization)?.mode');
  });

  it('switches the section title to "Taille, forme et couleur" in CATEGORIES mode', () => {
    expect(source).toContain('symbolMode === SymbolMode.CATEGORIES');
    expect(source).toContain('m.size_shape_and_color()');
    expect(source).toContain('m.size_and_shape()');
  });

  it('passes stroke-related props through to SymbolModeCategories', () => {
    const categoriesBlock = source
      .split('{:else if symbolMode === SymbolMode.CATEGORIES}')[1]
      ?.split('{/if}')[0];
    expect(categoriesBlock).toBeDefined();
    expect(categoriesBlock).toContain('onStyleChange={onStyleChange}');
    expect(categoriesBlock).toContain(
      'onStrokeMappingChange={onStrokeMappingChange}'
    );
    expect(categoriesBlock).toContain(
      'onStrokeClassificationChange={onStrokeClassificationChange}'
    );
    expect(categoriesBlock).toContain(
      'onStrokeInvertPalette={onStrokeInvertPalette}'
    );
  });

  it('keeps a separate discretization target for symbol size and fill channels', () => {
    expect(source).toContain(
      "let discretizationTarget = $state<'size' | 'fill'>"
    );
    expect(source).toContain('handleOpenFillDiscretization');
    expect(source).toContain('activeDiscretizationVisualization');
    expect(source).toContain('activeDiscretizationClassification');
  });

  it('passes fill-specific props to unique and proportional symbol modes', () => {
    expect(source).toContain('fillVisualization={fillVisualization}');
    expect(source).toContain('onFillMappingChange={onFillMappingChange}');
    expect(source).toContain(
      'onFillClassificationChange={onFillClassificationChange}'
    );
    expect(source).toContain('onFillInvertPalette={onFillInvertPalette}');
  });

  it('does not reset an existing fill mode when only the symbol mode changes', () => {
    expect(source).toContain('const currentFillMode =');
    expect(source).toContain(
      'getSymbolPrimitive(visualization)?.fillMode ?? visualization?.modes?.fill'
    );
    expect(source).toContain('currentFillMode !== undefined');
    expect(source).toContain(': FillMode.UNIQUE');
  });

  it('shows breakpoint controls only for the symbol fill discretization modal', () => {
    expect(source).toContain(
      "showBreakpointControls={discretizationTarget === 'fill'}"
    );
    expect(source).toContain(
      "role={discretizationTarget === 'fill' ? 'fill' : 'size'}"
    );
  });

  it('forwards clear-all to the shared filter panel', () => {
    expect(source).toContain('onClearFilters?: () => void');
    expect(source).toContain('onClearFilters={onClearFilters}');
  });
});
