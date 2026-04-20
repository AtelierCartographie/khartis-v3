import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'texts-config.svelte'),
  'utf8'
);

describe('TextsConfig — FillSection wiring (background)', () => {
  it('delegates the background fill rendering to the shared FillSection', () => {
    expect(source).toContain(
      "import FillSection from './shared/fill-section.svelte'"
    );
    expect(source).toContain('<FillSection');
  });

  it('uses the standard 4-mode preset for the text background (no DENSITY)', () => {
    expect(source).toContain('availableModes={FILL_MODES_STANDARD}');
    expect(source).toContain(
      "import { FILL_MODES_STANDARD } from './shared/fill-mode-presets'"
    );
  });

  it('tags the primitive as text and sets categoriesVariant to texts', () => {
    const fillBlock = source.split('<FillSection')[1]?.split('/>')[0];
    expect(fillBlock).toBeDefined();
    expect(fillBlock).toContain('primitive="text"');
    expect(fillBlock).toContain('categoriesVariant="texts"');
  });

  it('wires onBackgroundClassificationChange to the FillSection fill role', () => {
    const fillBlock = source.split('<FillSection')[1]?.split('/>')[0];
    expect(fillBlock).toContain(
      'onClassificationChange={onBackgroundClassificationChange'
    );
  });

  it('keeps the StrokeSection branch for the background halo', () => {
    expect(source).toContain('<StrokeSection');
    expect(source).toContain(
      'onStrokeClassificationChange={handleBackgroundStrokeClassificationChange}'
    );
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
