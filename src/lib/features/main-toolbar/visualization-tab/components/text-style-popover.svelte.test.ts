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
    expect(source).toContain(
      "const showSectionHeadings = $derived(visibleSection === 'both');"
    );
  });

  it('should render a contextual title from the visible section', () => {
    expect(source).toContain('const popoverTitle = $derived.by(() => {');
    expect(source).toContain("case 'primary':");
    expect(source).toContain("case 'secondary':");
    expect(source).toContain('aria-label={popoverTitle}');
    expect(source).toContain('<h3>{popoverTitle}</h3>');
    expect(source).toContain('class="popover-header-divider"');
  });

  it('should gate primary and secondary editors independently', () => {
    expect(source).toContain('{#if showPrimarySection}');
    expect(source).toContain('{#if secondary && showSecondarySection}');
    expect(source).toContain('{#if showSectionHeadings}');
    expect(source).toContain(
      '<SectionHeading title={m.text_style_primary_title()} />'
    );
    expect(source).toContain(
      '<SectionHeading title={m.text_style_secondary_title()} />'
    );
  });

  it('should render the compact font and size controls from the design', () => {
    expect(source).toContain(
      "const DEFAULT_FONT_FAMILY = AVAILABLE_FONTS[0] ?? 'Cabin';"
    );
    expect(source).toContain('const DEFAULT_FONT_SIZES = [');
    expect(source).toContain('const primaryFontSizes = $derived(');
    expect(source).toContain('const secondaryFontSizes = $derived(');
    expect(source).toContain('function handleSizeSelect(');
    expect(source).toContain('class="text-style-grid"');
    expect(source).toContain('{m.annotations_font()}');
    expect(source).toContain('{m.annotations_size()}');
    expect(source).toContain('<ChevronDown size={24} />');
  });

  it('should expose the compact quick action toolbar', () => {
    expect(source).toContain('class="quick-format-toolbar"');
    expect(source).toContain('TextColor');
    expect(source).toContain('TextUnderline');
    expect(source).toContain('primaryQuickColorInput');
    expect(source).toContain('secondaryQuickColorInput');
    expect(source).toContain('resolveAlignmentIcon');
    expect(source).toContain('nextAlignment(primary.align)');
    expect(source).toContain('nextAlignment(secondary.align)');
    expect(source).toContain('class="outline-text-icon"');
    expect(source).toContain('aria-disabled="true"');
  });

  it('should remove the old detailed controls from the popover body', () => {
    expect(source).not.toContain('ColorSelector');
    expect(source).not.toContain('SliderWithInput');
    expect(source).not.toContain('ToggleWithLabel');
    expect(source).not.toContain('label={m.opacity()}');
    expect(source).not.toContain('label={m.collision_detection()}');
    expect(source).not.toContain('label={m.dxp_masking()}');
    expect(source).not.toContain('icon={Close}');
  });
});
