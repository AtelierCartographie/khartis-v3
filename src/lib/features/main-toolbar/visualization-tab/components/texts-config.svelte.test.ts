import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'texts-config.svelte'),
  'utf8'
);

function getComponentBlock(name: string): string {
  return source.split(`<${name}`)[1]?.split('/>')[0] ?? '';
}

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

  it('sets categoriesVariant to texts without a redundant primitive tag', () => {
    const fillBlock = source.split('<FillSection')[1]?.split('/>')[0];
    expect(fillBlock).toBeDefined();
    expect(fillBlock).not.toContain('primitive=');
    expect(fillBlock).toContain('categoriesVariant="texts"');
  });

  it('wires onBackgroundClassificationChange to the FillSection fill role', () => {
    const fillBlock = getComponentBlock('FillSection');
    expect(fillBlock).toContain(
      'onClassificationChange={onBackgroundClassificationChange'
    );
    expect(fillBlock).toContain(
      'facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_VALUE}'
    );
    expect(fillBlock).toContain(
      'facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_CATEGORY}'
    );
    expect(fillBlock).not.toContain('TEXT_BACKGROUND_STROKE');
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
    expect(source).not.toContain('visibleSection={activeStyleSection}');
  });

  it('should no longer expose the Afficher valeurs toggle', () => {
    expect(source).not.toContain('m.show_secondary_values()');
  });

  it('should always render the secondary Texte dropdown (no secondaryEnabled gate)', () => {
    expect(source).not.toContain('{#if secondaryEnabled}');
  });

  it('should wire the restored halo and collision controls into the popover', () => {
    expect(source).toContain(
      'let fontFamily = $state<string>(DEFAULT_FONT_FAMILY);'
    );
    expect(source).toContain(
      'let secondaryFontFamily = $state<string>(DEFAULT_FONT_FAMILY);'
    );
    expect(source).toContain('let halo = $state<boolean>(false);');
    expect(source).toContain('let secondaryHalo = $state<boolean>(false);');
    expect(source).toContain('let secondaryBold = $state<boolean>(false);');
    expect(source).toContain('let secondaryItalic = $state<boolean>(false);');
    expect(source).toContain('handleHaloToggle');
    expect(source).toContain('handleFontFamilyChange');
    expect(source).toContain('handleHaloColorChange');
    expect(source).toContain('handleHaloWidthChange');
    expect(source).toContain('handleCollisionDetectionChange');
    expect(source).toContain('handleDxpMaskingChange');
    expect(source).toContain('handleSecondaryBoldChange');
    expect(source).toContain('handleSecondaryItalicChange');
    expect(source).toContain('handleSecondaryFontFamilyChange');
    expect(source).toContain('handleSecondaryHaloToggle');
    expect(source).toContain('handleSecondaryCollisionChange');
    expect(source).toContain('handleSecondaryDxpMaskingChange');
    expect(source).toContain('onHaloChange: handleHaloToggle');
    expect(source).toContain('onFontFamilyChange: handleFontFamilyChange');
    expect(source).toContain('onBoldChange: handleSecondaryBoldChange');
    expect(source).toContain('onItalicChange: handleSecondaryItalicChange');
    expect(source).toContain(
      'onFontFamilyChange: handleSecondaryFontFamilyChange'
    );
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

  it('should wire Carbon Aa trigger clicks through component events', () => {
    expect(source).toContain('on:click={togglePrimaryFormat}');
    expect(source).toContain('on:click={toggleSecondaryFormat}');
    expect(source).not.toContain('onclick={togglePrimaryFormat}');
    expect(source).not.toContain('onclick={toggleSecondaryFormat}');
  });

  it('should disable secondary controls until a primary text field is selected', () => {
    expect(source).toContain(
      'labelFieldSelection.selectedFieldId !== NONE_FIELD_ID'
    );
    expect(source).toContain('disabled={!hasPrimaryField}');
    expect(source).toContain(
      'disabled={!hasPrimaryField || !hasSecondaryField}'
    );
    expect(source).toContain('if (!hasPrimaryField || !hasSecondaryField) {');
  });

  it('should render the Figma text size controls inline', () => {
    expect(source).toContain(
      "import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte'"
    );
    expect(source).toContain('import { TextAllCaps, TextScale }');
    expect(source).toContain('const TEXT_SIZE_SLIDER_MIN = MIN_FONT_SIZE;');
    expect(source).toContain('const TEXT_SIZE_SLIDER_MAX = MAX_FONT_SIZE;');
    expect(source).toContain('<SectionHeading title={m.size_label()} />');
    expect(source).toContain('<SliderWithInput');
    expect(source).toContain('inputWidth="64px"');
    expect(source).toContain('onModesChange?.({ size: nextMode });');
    expect(source).toContain('FACET_SLOT.TEXT_VALUE');
  });

  it('should use the shared palette preview for missing-data color', () => {
    expect(source).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).not.toContain('ColorSelector');
  });
});

describe('TextsConfig — background discretization routing', () => {
  it('opens background fill and background stroke discretization through separate targets', () => {
    expect(source).toContain("discretizationTarget = 'background-fill'");
    expect(source).toContain("discretizationTarget = 'background-stroke'");
  });

  it('wires the background stroke section to its dedicated stroke classification state', () => {
    const strokeBlock = getComponentBlock('StrokeSection');
    expect(strokeBlock).toContain(
      'strokeClassification={backgroundVisualization?.text?.background'
    );
    expect(strokeBlock).toContain('?.strokeClassification}');
    expect(strokeBlock).toContain(
      'strokeValueColumn={backgroundVisualization?.text?.background'
    );
    expect(strokeBlock).toContain(
      'strokeCategoryColumn={backgroundVisualization?.text?.background'
    );
    expect(strokeBlock).toContain(
      'facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE}'
    );
    expect(strokeBlock).toContain(
      'facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY}'
    );
    expect(strokeBlock).not.toContain('FACET_SLOT.TEXT_BACKGROUND_VALUE}');
    expect(strokeBlock).not.toContain('FACET_SLOT.TEXT_BACKGROUND_CATEGORY}');
  });

  it('passes the correct shared-modal role for background fill vs stroke', () => {
    expect(source).toContain(
      "role={discretizationTarget === 'background-stroke' ? 'stroke' : 'fill'}"
    );
    expect(source).toContain(
      'classification={activeDiscretizationClassification}'
    );
    expect(source).toContain('valueColumn={activeDiscretizationValueColumn}');
  });
});
