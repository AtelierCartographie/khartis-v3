import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'fill-section.svelte'),
  'utf8'
);

describe('FillSection — interface', () => {
  it('accepts availableModes to filter the fill-mode toggle tabs', () => {
    expect(source).toContain('availableModes: readonly FillMode[]');
    expect(source).toContain('buildFillModeItems(availableModes)');
    expect(source).toContain('availableModes.indexOf(fillMode)');
  });

  it('renders SingleColorPreview only for FillMode.UNIQUE', () => {
    expect(source).toMatch(
      /fillMode === FillMode\.UNIQUE[\s\S]{0,200}SingleColorPreview/
    );
  });

  it('renders an optional density snippet only for FillMode.DENSITY', () => {
    expect(source).toMatch(
      /fillMode === FillMode\.DENSITY[\s\S]{0,120}densitySnippet/
    );
  });

  it('renders PalettePreview with SEQUENTIAL paletteType for FillMode.CLASSES', () => {
    const classesBlock = source.match(
      /fillMode === FillMode\.CLASSES[\s\S]*?FillMode\.CATEGORIES/
    )?.[0];
    expect(classesBlock).toBeDefined();
    expect(classesBlock).toContain('paletteType={PALETTE_TYPE.SEQUENTIAL}');
  });

  it('renders PalettePreview with QUALITATIVE paletteType + categoriesMode for FillMode.CATEGORIES', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
    expect(source).toContain('categoriesMode={true}');
    expect(source).toMatch(
      /fillMode === FillMode\.CATEGORIES[\s\S]{0,2000}?PalettePreview/
    );
  });

  it('hides the opacity slider for FillMode.NONE and FillMode.DENSITY', () => {
    expect(source).toContain(
      'fillMode !== FillMode.NONE && fillMode !== FillMode.DENSITY'
    );
  });

  it('shows the missing-data section only for CLASSES or CATEGORIES', () => {
    expect(source).toContain(
      'fillMode === FillMode.CLASSES || fillMode === FillMode.CATEGORIES'
    );
  });

  it('accepts a primitive prop tagging the consumer type', () => {
    expect(source).toContain('primitive: FillPrimitiveKind');
    expect(source).toContain(
      "export type FillPrimitiveKind = 'polygon' | 'symbol' | 'text'"
    );
  });

  it('exposes onClassificationChange strictly (no leak to another role)', () => {
    expect(source).toContain(
      'onClassificationChange: (updates: Partial<ClassificationConfig>) => void'
    );
    expect(source).not.toMatch(
      /onClassificationChange\s*\?\?\s*onStrokeClassificationChange/
    );
  });

  it('uses the shared fill-mode-presets module', () => {
    expect(source).toContain("from './fill-mode-presets'");
    expect(source).toContain('buildFillModeItems');
  });
});
