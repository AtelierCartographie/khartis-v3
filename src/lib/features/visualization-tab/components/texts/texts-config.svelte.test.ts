import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'texts-config.svelte'),
  'utf8'
);
const backgroundSectionSource = readFileSync(
  resolve(import.meta.dirname, 'text-background-section.svelte'),
  'utf8'
);
const labelSectionSource = readFileSync(
  resolve(import.meta.dirname, 'text-label-section.svelte'),
  'utf8'
);

describe('TextsConfig — text fill and contour wiring', () => {
  it('uses text color controls for Fond instead of background-box fill modes', () => {
    expect(backgroundSectionSource).toContain(
      "import ColorSelector from '$lib/features/commons/components/viz-controls/color-selector.svelte'"
    );
    expect(backgroundSectionSource).toContain(
      '<SectionHeading title={m.background()} />'
    );
    expect(backgroundSectionSource).toContain('<ColorSelector');
    expect(backgroundSectionSource).toContain('value={color}');
    expect(backgroundSectionSource).toContain('onchange={onColorChange}');
    expect(source).toContain('color={textColor}');
    expect(source).toContain('onColorChange={handleTextColorChange}');
    expect(backgroundSectionSource).not.toContain('<FillSection');
    expect(backgroundSectionSource).toContain(
      '<SliderWithInput\n  label={m.opacity()}'
    );
  });

  it('uses the Contour section for Deck text halo controls', () => {
    expect(backgroundSectionSource).toContain(
      '<SectionHeading title={m.stroke()} />'
    );
    expect(backgroundSectionSource).toContain(
      '<ToggleWithLabel label={m.stroke()} toggled={halo} ontoggle={onHaloToggle} />'
    );
    expect(backgroundSectionSource).toContain('value={haloColor}');
    expect(backgroundSectionSource).toContain('onchange={onHaloColorChange}');
    expect(backgroundSectionSource).toContain(
      '<SliderWithInput\n    label={m.thickness()}'
    );
    expect(source).toContain('onHaloToggle={handleHaloToggle}');
    expect(source).toContain('onHaloColorChange={handleHaloColorChange}');
    expect(source).toContain('onHaloWidthChange={handleHaloWidthChange}');
    expect(backgroundSectionSource).not.toContain('<StrokeSection');
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
      'let fontFamily = $state<string>(CARTOGRAPHIC_FONT_FAMILY);'
    );
    expect(source).toContain(
      'let secondaryFontFamily = $state<string>(CARTOGRAPHIC_FONT_FAMILY);'
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
    expect(labelSectionSource).toMatch(
      /width:\s*40px\s*!important;\s*height:\s*40px/
    );
    expect(labelSectionSource).not.toMatch(/width:\s*64px;\s*height:\s*64px/);
  });

  it('should route each Aa trigger to a single popover section', () => {
    expect(source).toContain(
      "toggleStylePopover('primary', primaryTriggerRef);"
    );
    expect(source).toContain(
      "toggleStylePopover('secondary', secondaryTriggerRef);"
    );
    expect(labelSectionSource).toContain("activeStyleSection === 'primary'");
    expect(labelSectionSource).toContain("activeStyleSection === 'secondary'");
  });

  it('should wire Carbon Aa trigger clicks through component events', () => {
    expect(labelSectionSource).toContain('on:click={onTogglePrimaryFormat}');
    expect(labelSectionSource).toContain('on:click={onToggleSecondaryFormat}');
    expect(source).toContain('onTogglePrimaryFormat={togglePrimaryFormat}');
    expect(source).toContain('onToggleSecondaryFormat={toggleSecondaryFormat}');
  });

  it('should disable secondary controls until a primary text field is selected', () => {
    expect(source).toContain(
      'labelFieldSelection.selectedFieldId !== NONE_FIELD_ID'
    );
    expect(labelSectionSource).toContain('disabled={!hasPrimaryField}');
    expect(labelSectionSource).toContain(
      'disabled={!hasPrimaryField || !hasSecondaryField}'
    );
    expect(source).toContain('if (!hasPrimaryField || !hasSecondaryField) {');
  });

  it('should render the Figma text size controls inline', () => {
    const sizeSectionSource = readFileSync(
      resolve(import.meta.dirname, 'text-size-section.svelte'),
      'utf8'
    );
    expect(sizeSectionSource).toContain(
      "import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte'"
    );
    expect(sizeSectionSource).toContain(
      'import { Table, TextScale, TextAllCaps }'
    );
    expect(source).toContain('const TEXT_SIZE_SLIDER_MIN = MIN_FONT_SIZE;');
    expect(source).toContain('const TEXT_SIZE_SLIDER_MAX = MAX_FONT_SIZE;');
    expect(sizeSectionSource).toContain(
      '<SectionHeading title={m.size_label()} />'
    );
    expect(sizeSectionSource).toContain('<SliderWithInput');
    expect(sizeSectionSource).toContain('inputWidth="64px"');
    expect(source).toContain('onModesChange?.({ size: nextMode });');
    expect(sizeSectionSource).toContain('FACET_SLOT.TEXT_VALUE');
    expect(sizeSectionSource).toContain('SizeMode.CLASSES');
    expect(sizeSectionSource).toContain('m.size_mode_classes()');
    expect(sizeSectionSource).toContain(
      "filterFieldsByKind(\n      selectableDataFields,\n      'numeric'"
    );
    expect(sizeSectionSource).toContain('label={sizeSliderLabel}');
  });

  it('should use the shared palette preview for missing-data color', () => {
    const missingDataSectionSource = readFileSync(
      resolve(import.meta.dirname, 'text-missing-data-section.svelte'),
      'utf8'
    );
    expect(missingDataSectionSource).toContain(
      "import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte'"
    );
    expect(missingDataSectionSource).toContain('<SingleColorPreview');
    expect(missingDataSectionSource).not.toContain('ColorSelector');
  });
});

describe('TextsConfig — text-size discretization routing', () => {
  it('opens text size classes through the shared size discretization modal', () => {
    expect(source).toContain('function openTextSizeDiscretization()');
    expect(source).toContain(
      'onOpenDiscretization={openTextSizeDiscretization}'
    );
    expect(source).toContain('role="size"');
    expect(source).toContain(
      'classification={activeDiscretizationClassification}'
    );
    expect(source).toContain('valueColumn={activeDiscretizationValueColumn}');
    expect(source).toContain('onClassificationChange?.(classification);');
  });
});
