import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'palette-comparison.svelte'),
  'utf8'
);

describe('PaletteComparison (Actuelle/Nouvelle preview)', () => {
  it('should derive isQualitative from paletteType to switch layout', () => {
    expect(source).toContain(
      'const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE)'
    );
  });

  it('should apply the side-by-side class when palette type is QUALITATIVE', () => {
    expect(source).toContain('class:side-by-side={isQualitative}');
  });

  it('should render a single solid swatch per side in QUALITATIVE mode', () => {
    expect(source).toMatch(/{#if isQualitative}[\s\S]*?class="solid-swatch"/);
  });

  it('should render swatch rows (multi-color) in the non-qualitative branch', () => {
    const stackedBlock = source.split('{:else}')[1];
    expect(stackedBlock).toBeDefined();
    expect(stackedBlock).toContain('swatch-row');
    expect(stackedBlock).toMatch(/#each currentColors/);
    expect(stackedBlock).toMatch(/#each newColors/);
  });

  it('should label both sides with Actuelle and Nouvelle i18n keys', () => {
    expect(source).toContain('{m.palette_current()}');
    expect(source).toContain('{m.palette_new()}');
  });
});
