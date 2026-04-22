import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'map-tooltip-overlay.svelte'),
  'utf8'
);

describe('MapTooltipOverlay — responsive inspector UX', () => {
  it('switches semantics between tooltip preview and interactive inspector', () => {
    expect(source).toContain("role={isInteractive ? 'dialog' : 'tooltip'}");
  });

  it('renders a dedicated mobile sheet layout instead of desktop floating positioning', () => {
    expect(source).toContain('class:mobile-sheet={isMobileLayout}');
    expect(source).toContain('left: var(--cds-spacing-03, 0.75rem);');
    expect(source).toContain('bottom: calc(');
  });

  it('keeps desktop hover previews compact while preserving access to full details on click', () => {
    expect(source).toContain('const PREVIEW_PRIMARY_ENTRIES_COUNT = 2;');
    expect(source).toContain(
      'tooltipState.entries.slice(0, PREVIEW_PRIMARY_ENTRIES_COUNT)'
    );
    expect(source).toContain('{#if previewOverflowCount > 0}');
  });

  it('uses a compact fixed-height inspector with internal scrolling on desktop', () => {
    expect(source).toContain("placement: 'inside-viewer-top'");
    expect(source).toContain(
      'height: var(--tooltip-interactive-height, 22rem);'
    );
    expect(source).toContain('overflow-y: auto;');
    expect(source).toContain('width: min(18rem, calc(100vw - 24px));');
  });

  it('anchors desktop positioning to the workspace viewport instead of the white page sheet', () => {
    expect(source).toContain(
      "const workspaceViewport = document.querySelector('.workspace-viewport');"
    );
    expect(source).toContain(
      "const mainContent = document.querySelector('.main-content');"
    );
  });

  it('dismisses transient hover previews when switching into mobile view', () => {
    expect(source).toContain('globalState.isMobileView');
    expect(source).toContain('tooltipState.visible');
    expect(source).toContain('!tooltipState.pinned');
    expect(source).toContain('mapTooltipStore.hide();');
  });

  it('removes visible borders and tightens the typography', () => {
    expect(source).toContain('border: none;');
    expect(source).toContain('font-size: 11px;');
  });

  it('drops the accordion and relies on a single scrollable content area', () => {
    expect(source).not.toContain('accordion-toggle');
    expect(source).not.toContain('tooltip-accordion');
    expect(source).toContain('tooltipState.entries');
  });

  it('renders the open inspector without truncating long keys or values', () => {
    expect(source).toContain('.interactive .tooltip-row {');
    expect(source).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(source).toContain('text-overflow: clip;');
    expect(source).toContain('overflow-wrap: anywhere;');
  });

  it('adds a compact title and Carbon tags for short identifier values', () => {
    expect(source).toContain("import { Tag } from 'carbon-components-svelte';");
    expect(source).toContain('{#if headlineEntry}');
    expect(source).toContain(
      '<div class="tooltip-title">{headlineEntry.value}</div>'
    );
    expect(source).toContain('<Tag size="sm" type="warm-gray">');
    expect(source).toContain('BADGE_ENTRY_KEYS');
  });
});
