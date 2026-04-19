import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'texts-config.svelte'),
  'utf8'
);

describe('TextsConfig — palette wiring', () => {
  it('should import PALETTE_TYPE from palette-popover/palette.constants', () => {
    expect(source).toContain(
      "from '$lib/features/commons/components/palette-popover/palette.constants'"
    );
    expect(source).toContain('PALETTE_TYPE');
  });

  it('should wire SEQUENTIAL paletteType on the background CLASSES-mode PalettePreview', () => {
    const sequentialCount = (
      source.match(/paletteType=\{PALETTE_TYPE\.SEQUENTIAL\}/g) || []
    ).length;
    expect(sequentialCount).toBeGreaterThanOrEqual(1);
  });

  it('should wire QUALITATIVE paletteType on the background CATEGORIES-mode PalettePreview', () => {
    const qualitativeCount = (
      source.match(/paletteType=\{PALETTE_TYPE\.QUALITATIVE\}/g) || []
    ).length;
    expect(qualitativeCount).toBeGreaterThanOrEqual(1);
  });

  it('should never default to the implicit paletteType on a PalettePreview', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    expect(paletteBlocks.length).toBeGreaterThan(0);
    paletteBlocks.forEach((block) => {
      expect(block).toMatch(
        /paletteType=\{PALETTE_TYPE\.(SEQUENTIAL|QUALITATIVE)\}/
      );
    });
  });

  it('should use SingleColorPreview for the background UNIQUE mode', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    const singleColorCount = (source.match(/<SingleColorPreview/g) ?? [])
      .length;
    expect(singleColorCount).toBeGreaterThanOrEqual(1);
  });

  it('should enable categoriesMode on every QUALITATIVE PalettePreview', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    const qualitativeBlocks = paletteBlocks.filter((block) =>
      block.includes('paletteType={PALETTE_TYPE.QUALITATIVE}')
    );
    expect(qualitativeBlocks.length).toBeGreaterThanOrEqual(1);
    qualitativeBlocks.forEach((block) => {
      expect(block).toContain('categoriesMode={true}');
      expect(block).toMatch(
        /categoryLabels=\{(visualization|backgroundVisualization)\?\.classification[\s\S]*?labels[\s\S]*?\?\?[\s\S]*?\[\]\}/
      );
    });
  });
});

describe('TextsConfig — Figma layout', () => {
  it('should delegate text styling to the TextStylePopover', () => {
    expect(source).toContain(
      "import TextStylePopover from './text-style-popover.svelte'"
    );
    expect(source).toContain('<TextStylePopover');
    expect(source).toContain(
      "let activeStyleSection = $state<StyleSection>('primary');"
    );
    expect(source).toContain('visibleSection={activeStyleSection}');
  });

  it('should no longer expose the Afficher valeurs toggle', () => {
    expect(source).not.toContain('m.show_secondary_values()');
  });

  it('should always render the secondary Texte dropdown (no secondaryEnabled gate)', () => {
    expect(source).not.toContain('{#if secondaryEnabled}');
  });

  it('should wire the restored halo and collision controls into the popover', () => {
    expect(source).toContain('let halo = $state<boolean>(false);');
    expect(source).toContain('let secondaryHalo = $state<boolean>(false);');
    expect(source).toContain('handleHaloToggle');
    expect(source).toContain('handleHaloColorChange');
    expect(source).toContain('handleHaloWidthChange');
    expect(source).toContain('handleCollisionDetectionChange');
    expect(source).toContain('handleDxpMaskingChange');
    expect(source).toContain('handleSecondaryHaloToggle');
    expect(source).toContain('handleSecondaryCollisionChange');
    expect(source).toContain('handleSecondaryDxpMaskingChange');
    expect(source).toContain('onHaloChange: handleHaloToggle');
    expect(source).toContain(
      'onCollisionDetectionChange: handleCollisionDetectionChange'
    );
    expect(source).toContain('onDxpMaskingChange: handleDxpMaskingChange');
  });

  it('should compact the Aa format trigger (no 64x64)', () => {
    expect(source).toMatch(/width:\s*40px\s*!important;\s*height:\s*40px/);
    expect(source).not.toMatch(/width:\s*64px;\s*height:\s*64px/);
  });

  it('should route each Aa trigger to a single popover section', () => {
    expect(source).toContain(
      "toggleStylePopover('primary', primaryTriggerRef);"
    );
    expect(source).toContain(
      "toggleStylePopover('secondary', secondaryTriggerRef);"
    );
    expect(source).toContain("activeStyleSection === 'primary'");
    expect(source).toContain("activeStyleSection === 'secondary'");
  });

  it('should disable secondary controls until a primary text field is selected', () => {
    expect(source).toContain(
      'const hasPrimaryField = $derived(selectedLabelFieldId !== NONE_FIELD_ID);'
    );
    expect(source).toContain('disabled={!hasPrimaryField}');
    expect(source).toContain(
      'disabled={!hasPrimaryField || !hasSecondaryField}'
    );
    expect(source).toContain('if (!hasPrimaryField || !hasSecondaryField) {');
  });
});
