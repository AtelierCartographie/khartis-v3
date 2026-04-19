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
});
