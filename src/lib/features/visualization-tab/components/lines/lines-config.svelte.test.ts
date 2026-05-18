import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'lines-config.svelte'),
  'utf8'
);
const thicknessSectionSource = readFileSync(
  resolve(import.meta.dirname, 'line-thickness-section.svelte'),
  'utf8'
);
const colorSectionSource = readFileSync(
  resolve(import.meta.dirname, 'line-color-section.svelte'),
  'utf8'
);

describe('LinesConfig — palette wiring', () => {
  it('keeps the section structure for thickness, color and scoped controls', () => {
    expect(thicknessSectionSource).toContain(
      '<SectionHeading title={m.thickness()} />'
    );
    expect(colorSectionSource).toContain(
      '<SectionHeading title={m.color()} />'
    );
    expect(thicknessSectionSource).toContain('<ToggleWithLabel');
    expect(thicknessSectionSource).toContain('<MissingDataSection');
    expect(colorSectionSource).toContain('<ToggleWithLabel');
    expect(colorSectionSource).toContain('<MissingDataSection');
    expect(source).toContain('<LineThicknessSection');
    expect(source).toContain('<LineColorSection');
  });

  it('uses only Carbon icons in line mode selectors', () => {
    expect(thicknessSectionSource).toContain(
      "import { Minimize, Subtract, Table } from 'carbon-icons-svelte'"
    );
    expect(colorSectionSource).toContain(
      "import { Subtract, Table, Tag } from 'carbon-icons-svelte'"
    );
    expect(thicknessSectionSource).not.toContain('<svg');
    expect(colorSectionSource).not.toContain('<svg');
  });

  it('renders the proportional and classes thickness branches with shared controls', () => {
    const proportionalBlock = thicknessSectionSource.split(
      '{:else if thicknessMode === ThicknessMode.PROPORTIONAL}'
    )[1];
    expect(proportionalBlock).toBeDefined();
    expect(proportionalBlock).toContain('<FacetsVariablePicker');
    expect(proportionalBlock).toContain('label={m.max_thickness()}');

    const classesBlock = thicknessSectionSource.split(
      '{:else if thicknessMode === ThicknessMode.CLASSES}'
    )[1];
    expect(classesBlock).toBeDefined();
    expect(classesBlock).toContain('<DiscretizationRow');
    expect(classesBlock).toContain('label={m.max_thickness()}');
  });

  it('filters line variable pickers by quantitative or qualitative type', () => {
    expect(thicknessSectionSource).toContain(
      "filterFieldsByKind(\n      selectableDataFields,\n      'numeric'"
    );
    expect(colorSectionSource).toContain(
      "filterFieldsByKind(\n      selectableDataFields,\n      'numeric'"
    );
    expect(colorSectionSource).toContain(
      "filterFieldsByKind(\n      selectableDataFields,\n      'textual'"
    );
  });

  it('should import PALETTE_TYPE from palette-popover/palette.constants', () => {
    expect(colorSectionSource).toContain(
      "from '$lib/features/commons/components/palette-popover/palette.constants'"
    );
    expect(colorSectionSource).toContain('PALETTE_TYPE');
  });

  it('delegates the CLASSES branch PalettePreview paletteType to resolvePaletteTypeForBreakpoint', () => {
    const classesBlock = colorSectionSource.split(
      'colorMode === ColorMode.CLASSES'
    )[1];
    expect(classesBlock).toBeDefined();
    const classesPalette = classesBlock
      .split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(classesPalette).toBeDefined();
    expect(classesPalette).toContain('resolvePaletteTypeForBreakpoint');
    expect(classesPalette).toContain('classification');
  });

  it('shows breakpoint controls only for line color discretization', () => {
    const modalBlock = source.split('<DiscretizationModal')[1]?.split('/>')[0];

    expect(modalBlock).toContain(
      "showBreakpointControls={discretizationTarget === 'color'}"
    );
  });

  it('should pass paletteType=QUALITATIVE on the CATEGORIES branch PalettePreview', () => {
    const categoriesBlock = colorSectionSource.split(
      '{:else if colorMode === ColorMode.CATEGORIES}'
    )[1];
    expect(categoriesBlock).toBeDefined();
    const categoriesPalette = categoriesBlock
      .split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(categoriesPalette).toBeDefined();
    expect(categoriesPalette).toContain(
      'paletteType={PALETTE_TYPE.QUALITATIVE}'
    );
  });

  it('should route ColorMode.UNIQUE through SingleColorPreview', () => {
    expect(colorSectionSource).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    const uniqueBlock = colorSectionSource
      .split('colorMode === ColorMode.UNIQUE')[1]
      ?.split('{:else if')[0];
    expect(uniqueBlock).toContain('<SingleColorPreview');
    expect(uniqueBlock).not.toContain('<ColorSelector');
    expect(uniqueBlock).not.toContain('<MissingDataSection');
  });

  it('configures line missing data without the generic representation selector', () => {
    expect(colorSectionSource).toContain('showShapeSelector={false}');
    expect(colorSectionSource).toContain('sizeLabel={m.thickness()}');
    expect(colorSectionSource).toContain('showDashedToggle={true}');
    expect(thicknessSectionSource).toContain('showShapeSelector={false}');
    expect(thicknessSectionSource).toContain('showSizeSlider={false}');
    expect(thicknessSectionSource).toContain('showDashedToggle={true}');
  });

  it('should enable Categories Aspect popover via categoriesMode + categoryLabels on CATEGORIES', () => {
    const categoriesBlock = colorSectionSource.split(
      '{:else if colorMode === ColorMode.CATEGORIES}'
    )[1];
    const paletteBlock = categoriesBlock
      ?.split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(paletteBlock).toContain('categoriesMode={true}');
    expect(paletteBlock).toContain('categoryLabels={categoryLabels}');
  });

  it('does not hard-reset mappings or classification inside mode handlers', () => {
    const thicknessHandler = source
      .split('function handleThicknessModeChange(index: number) {')[1]
      ?.split('function handleColorModeChange(index: number) {')[0];
    const colorHandler = source
      .split('function handleColorModeChange(index: number) {')[1]
      ?.split('function handleThicknessChange(value: number) {')[0];

    expect(thicknessHandler).toBeDefined();
    expect(colorHandler).toBeDefined();

    expect(thicknessHandler).not.toContain(
      'onMappingChange?.({ sizeColumn: undefined });'
    );
    expect(thicknessHandler).not.toContain('breaks: undefined');
    expect(thicknessHandler).not.toContain('counts: undefined');
    expect(colorHandler).not.toContain(
      'onMappingChange?.({ valueColumn: undefined, categoryColumn: undefined });'
    );
    expect(colorHandler).not.toContain(
      'onMappingChange?.({ categoryColumn: undefined });'
    );
    expect(colorHandler).not.toContain(
      'onMappingChange?.({ valueColumn: undefined });'
    );
    expect(colorHandler).not.toContain('paletteId: undefined');
    expect(colorHandler).not.toContain('patternParams: undefined');
  });
});
