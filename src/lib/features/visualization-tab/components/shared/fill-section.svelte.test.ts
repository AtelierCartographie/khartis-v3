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

  it('delegates the CLASSES-mode paletteType to resolvePaletteTypeForBreakpoint so DIVERGING/SEQUENTIAL stays in sync with the helper', () => {
    const classesBlock = source.match(
      /fillMode === FillMode\.CLASSES[\s\S]*?FillMode\.CATEGORIES/
    )?.[0];
    expect(classesBlock).toBeDefined();
    expect(classesBlock).toContain('resolvePaletteTypeForBreakpoint');
    expect(classesBlock).toContain('visualization?.classification');
  });

  it('hides the standalone palette inversion button in CLASSES mode', () => {
    const classesBlock = source.match(
      /fillMode === FillMode\.CLASSES[\s\S]*?FillMode\.CATEGORIES/
    )?.[0];
    expect(classesBlock).toBeDefined();
    expect(classesBlock).toContain('showInvertButton={false}');
  });

  it('renders PalettePreview with QUALITATIVE paletteType + categoriesMode for FillMode.CATEGORIES', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
    expect(source).toContain('categoriesMode={true}');
    expect(source).toContain(
      "showCategoriesCommonAspect={categoriesVariant === 'polygons'}"
    );
    expect(source).toMatch(
      /fillMode === FillMode\.CATEGORIES[\s\S]{0,2000}?PalettePreview/
    );
  });

  it('derives a polygon-only common aspect from the fill classification pattern', () => {
    expect(source).toContain('const categoriesCommonAspect = $derived');
    expect(source).toContain("categoriesVariant === 'polygons'");
    expect(source).toContain('visualization?.classification?.patternId');
    expect(source).toContain('visualization?.classification?.patternParams');
    expect(source).toContain('categoriesCommonAspect={categoriesCommonAspect}');
  });

  it('routes unique polygon fill motifs into the polygon classification', () => {
    expect(source).toContain('patternId={categoriesVariant ===');
    expect(source).toContain('onpatternchange={(patternId, patternParams)');
    expect(source).toContain('onClassificationChange({');
    expect(source).toContain(
      'patternParams: patternId ? patternParams : undefined'
    );
  });

  it('hides the opacity slider for FillMode.NONE and FillMode.DENSITY', () => {
    expect(source).toContain(
      'fillMode !== FillMode.NONE && fillMode !== FillMode.DENSITY'
    );
  });

  it('lets consumers opt into Figma-style opacity bounds', () => {
    expect(source).toContain('showOpacityBounds?: boolean;');
    expect(source).toContain('opacityInputWidth?: string;');
    expect(source).toContain('showMinMax={showOpacityBounds}');
    expect(source).toContain('inputWidth={opacityInputWidth}');
  });

  it('shows the missing-data section only for CLASSES or CATEGORIES', () => {
    expect(source).toContain(
      'fillMode === FillMode.CLASSES || fillMode === FillMode.CATEGORIES'
    );
  });

  it('exposes the missing-data pattern toggle only for polygon fills', () => {
    expect(source).toContain('missingDataPattern?: boolean;');
    expect(source).toContain(
      'onMissingDataPatternChange?: (pattern: boolean) => void;'
    );
    expect(source).toContain(
      "showPatternToggle={categoriesVariant === 'polygons'}"
    );
    expect(source).toContain('pattern={missingDataPattern}');
    expect(source).toContain(
      'onpatternchange={onMissingDataPatternChange ?? (() => {})}'
    );
  });

  it('does not require a consumer primitive tag', () => {
    expect(source).not.toContain('primitive: FillPrimitiveKind');
    expect(source).not.toContain('FillPrimitiveKind');
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
