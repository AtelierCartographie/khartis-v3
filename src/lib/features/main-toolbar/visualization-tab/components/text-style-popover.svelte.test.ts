import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const popoverSource = readFileSync(
  resolve(import.meta.dirname, 'text-style-popover.svelte'),
  'utf8'
);
const sectionSource = readFileSync(
  resolve(import.meta.dirname, 'text-style-section.svelte'),
  'utf8'
);
const source = `${popoverSource}\n${sectionSource}`;

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
    expect(popoverSource).toContain('{#if showPrimarySection}');
    expect(popoverSource).toContain('{#if showSecondarySection}');
    expect(popoverSource).toContain('section={primary}');
    expect(popoverSource).toContain('section={secondary}');
    expect(sectionSource).toContain(
      'class:text-style-section--disabled={!enabled}'
    );
    expect(popoverSource).toContain('m.text_style_primary_title()');
    expect(popoverSource).toContain('m.text_style_secondary_title()');
  });

  it('should render the compact font and size controls from the design', () => {
    expect(sectionSource).toContain('DEFAULT_FONT_FAMILY,');
    expect(sectionSource).toContain('resolveFontSizeOptions');
    expect(sectionSource).toContain('const fontSizes = $derived(');
    expect(sectionSource).toContain('function openSelectPicker(');
    expect(sectionSource).toContain('function handleFontFamilySelect(');
    expect(sectionSource).toContain('function handleSizeSelect(');
    expect(sectionSource).toContain('class="text-style-grid"');
    expect(sectionSource).toContain('{m.annotations_font()}');
    expect(sectionSource).toContain('{m.annotations_size()}');
    expect(sectionSource).toContain('bind:this={fontSelectRef}');
    expect(sectionSource).toContain('bind:this={sizeSelectRef}');
    expect(sectionSource).toContain('normalizeFontFamily(section?.fontFamily)');
    expect(sectionSource).toContain(
      '{#each AVAILABLE_FONTS as fontFamily (fontFamily)}'
    );
    expect(sectionSource).toContain('class="compact-field__picker-trigger"');
    expect(sectionSource).toContain(
      'onclick={() => openSelectPicker(fontSelectRef)}'
    );
    expect(sectionSource).toContain(
      'onclick={() => openSelectPicker(sizeSelectRef)}'
    );
    expect(sectionSource).toContain('height: 32px;');
  });

  it('should expose the compact quick action toolbar', () => {
    expect(sectionSource).toContain('class="quick-format-toolbar"');
    expect(sectionSource).toContain('TextColor');
    expect(sectionSource).toContain('TextUnderline');
    expect(sectionSource).toContain('quickColorInput');
    expect(sectionSource).toContain('quickHaloColorInput');
    expect(sectionSource).toContain('resolveAlignmentIcon');
    expect(sectionSource).toContain('nextAlignment(align)');
    expect(sectionSource).toContain('class="outline-text-icon"');
    expect(sectionSource).toContain('handleQuickHaloColorInput');
    expect(sectionSource).toContain('width: 32px;');
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
