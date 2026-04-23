import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'text-style-popover.svelte'),
  'utf8'
);

describe('TextStylePopover', () => {
  it('should support selecting which section is visible', () => {
    expect(source).toContain(
      "type VisibleSection = 'primary' | 'secondary' | 'both';"
    );
    expect(source).toContain("visibleSection = 'both'");
    expect(source).toContain('const showPrimarySection = $derived(');
    expect(source).toContain('const showSecondarySection = $derived(');
  });

  it('should render the compact Figma title with a close button', () => {
    expect(source).toContain(
      'const popoverTitle = $derived(m.text_style_popover_title());'
    );
    expect(source).toContain('aria-label={popoverTitle}');
    expect(source).toContain('<h3>{popoverTitle}</h3>');
    expect(source).toContain('class="popover-close-button"');
    expect(source).toContain('<Close size={16} />');
    expect(source).toContain('width: 320px;');
  });

  it('should gate primary and secondary editors independently', () => {
    expect(source).toContain('{#if showPrimarySection}');
    expect(source).toContain('class:text-style-section--disabled={!secondary}');
    expect(source).toContain('<h4>{m.text_style_primary_title()}</h4>');
    expect(source).toContain('<h4>{m.text_style_secondary_title()}</h4>');
  });

  it('should render the compact font and size controls from the design', () => {
    expect(source).toContain('DEFAULT_FONT_FAMILY,');
    expect(source).toContain('resolveFontSizeOptions');
    expect(source).toContain('const primaryFontSizes = $derived(');
    expect(source).toContain('const secondaryFontSizes = $derived(');
    expect(source).toContain('function openSelectPicker(');
    expect(source).toContain('function handleFontFamilySelect(');
    expect(source).toContain('function handleSizeSelect(');
    expect(source).toContain('class="text-style-grid"');
    expect(source).toContain('{m.annotations_font()}');
    expect(source).toContain('{m.annotations_size()}');
    expect(source).toContain('bind:this={primaryFontSelectRef}');
    expect(source).toContain('bind:this={primarySizeSelectRef}');
    expect(source).toContain('bind:this={secondaryFontSelectRef}');
    expect(source).toContain('bind:this={secondarySizeSelectRef}');
    expect(source).toContain('normalizeFontFamily(primary.fontFamily)');
    expect(source).toContain('normalizeFontFamily(secondary?.fontFamily)');
    expect(source).toContain(
      '{#each AVAILABLE_FONTS as fontFamily (fontFamily)}'
    );
    expect(source).toContain('handleFontFamilySelect(');
    expect(source).toContain('class="compact-field__picker-trigger"');
    expect(source).toContain(
      'onclick={() => openSelectPicker(primaryFontSelectRef)}'
    );
    expect(source).toContain(
      'onclick={() => openSelectPicker(primarySizeSelectRef)}'
    );
    expect(source).toContain(
      'onclick={() => openSelectPicker(secondaryFontSelectRef)}'
    );
    expect(source).toContain(
      'onclick={() => openSelectPicker(secondarySizeSelectRef)}'
    );
    expect(source).toContain('height: 32px;');
  });

  it('should expose the compact quick action toolbar', () => {
    expect(source).toContain('class="quick-format-toolbar"');
    expect(source).toContain('TextColor');
    expect(source).toContain('TextUnderline');
    expect(source).toContain('primaryQuickColorInput');
    expect(source).toContain('primaryQuickHaloColorInput');
    expect(source).toContain('secondaryQuickColorInput');
    expect(source).toContain('secondaryQuickHaloColorInput');
    expect(source).toContain('resolveAlignmentIcon');
    expect(source).toContain('nextAlignment(primary.align)');
    expect(source).toContain('nextAlignment(secondary.align)');
    expect(source).toContain('class="outline-text-icon"');
    expect(source).toContain('handleQuickHaloColorInput');
    expect(source).toContain('width: 32px;');
  });

  it('should keep the popover open for internal clicks after rerenders', () => {
    expect(source).toContain('function eventTargetsElement(');
    expect(source).toContain('const path = e.composedPath();');
    expect(source).toContain('path.includes(element)');
    expect(source).toContain('eventTargetsElement(path, e.target, popoverRef)');
    expect(source).toContain(
      'eventTargetsElement(path, e.target, triggerElement)'
    );
  });

  it('should remove the old detailed controls from the popover body', () => {
    expect(source).not.toContain('ColorSelector');
    expect(source).not.toContain('SliderWithInput');
    expect(source).not.toContain('ToggleWithLabel');
    expect(source).not.toContain('label={m.opacity()}');
    expect(source).not.toContain('label={m.collision_detection()}');
    expect(source).not.toContain('label={m.dxp_masking()}');
  });
});
