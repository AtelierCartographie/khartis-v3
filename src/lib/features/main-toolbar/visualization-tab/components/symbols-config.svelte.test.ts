import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbols-config.svelte'),
  'utf8'
);

describe('SymbolsConfig container', () => {
  it('still offers the five symbol modes (including density)', () => {
    expect(source).toContain('m.symbol_mode_unique()');
    expect(source).toContain('m.symbol_mode_proportional()');
    expect(source).toContain('m.symbol_mode_classes()');
    expect(source).toContain('m.symbol_mode_categories()');
    expect(source).toContain('m.symbol_mode_density()');
  });

  it('routes the density branch to SymbolModeDensity (feature preserved)', () => {
    expect(source).toContain('SymbolModeDensity');
    expect(source).toContain('SymbolMode.DENSITY');
  });

  it('switches the section title to "Taille, forme et couleur" in CATEGORIES mode', () => {
    expect(source).toContain('symbolMode === SymbolMode.CATEGORIES');
    expect(source).toContain('m.size_shape_and_color()');
    expect(source).toContain('m.size_and_shape()');
  });
});
