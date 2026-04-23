import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POPOVER_DIMENSIONS } from './step-toolbar.constants';

const source = readFileSync(
  resolve(import.meta.dirname, 'step-toolbar.svelte'),
  'utf8'
);
const toolPopoverSource = readFileSync(
  resolve(import.meta.dirname, 'tool-popover.svelte'),
  'utf8'
);

describe('StepToolbar', () => {
  it('keeps popovers outside of the scrollable viewport', () => {
    const scrollViewportStart = source.indexOf(
      '<div class={CSS_CLASSES.SCROLL_VIEWPORT}>'
    );
    const toolPopoverStart = source.indexOf('<ToolPopover');
    const colorBlindnessStart = source.indexOf(
      `<div\n    id={DOM_IDS.COLORBLINDNESS_NOTIFICATION}`
    );

    expect(scrollViewportStart).toBeGreaterThanOrEqual(0);
    expect(toolPopoverStart).toBeGreaterThan(scrollViewportStart);
    expect(colorBlindnessStart).toBeGreaterThan(toolPopoverStart);
  });

  it('uses the shared maximum popover height', () => {
    expect(POPOVER_DIMENSIONS.MAX_HEIGHT).toBe(
      'min(max(488px, 58vh), calc(100dvh - 80px))'
    );
  });

  it('keeps tool popovers scrollable without showing the native scrollbar', () => {
    expect(toolPopoverSource).toContain('overflow-y: auto;');
    expect(toolPopoverSource).toContain('scrollbar-width: none;');
    expect(toolPopoverSource).toContain('.popover-scroll::-webkit-scrollbar');
    expect(toolPopoverSource).toContain('display: none;');
  });

  it('keeps tool expandables on the shared dark background in dark theme', () => {
    expect(source).toContain(
      ":global(html[theme='g100'] #khartis-tool-popover)"
    );
    expect(source).toContain(
      '--khartis-expandable-section-background: var(--cds-background);'
    );
    expect(source).not.toContain(
      ':global(:root #khartis-tool-popover) {\n    --khartis-expandable-section-background'
    );
  });

  it('keeps the step toolbar itself opaque', () => {
    expect(source).toContain('background: var(--cds-background);');
    expect(source).not.toContain('backdrop-filter: blur(10px) saturate(1.2);');
  });

  it('keeps tool popover contents opaque', () => {
    expect(toolPopoverSource).toContain(
      'background: var(--khartis-control-surface-background);'
    );
  });

  it('dims the tool popover while a styling element is being dragged', () => {
    expect(toolPopoverSource).toContain(
      ':global(body.is-dragging-styling-target #khartis-tool-popover)'
    );
    expect(toolPopoverSource).toContain(
      ':global(body.is-dragging-styling-target #khartis-tool-popover .bx--popover)'
    );
    expect(toolPopoverSource).toContain('opacity: 0.28;');
    expect(toolPopoverSource).toContain('pointer-events: none;');
  });

  it('does not push shorter right-top popovers downward', () => {
    expect(toolPopoverSource).toContain('computedTopOffset = Math.min(');
    expect(toolPopoverSource).toContain(
      'Math.round((toolbarRect.height - popoverRect.height) / 2)'
    );
  });

  it('keeps non-projection tools at list width', () => {
    expect(source).toContain('const popoverViewMode = $derived(');
    expect(source).toContain(
      'globalState.selectedTool === VisualizationToolId.Projection'
    );
    expect(source).toContain("globalState.projectionViewMode ?? 'list'");
    expect(source).toContain('viewMode={popoverViewMode}');
  });

  it('uses a narrower dedicated width for the projection grid popover', () => {
    expect(POPOVER_DIMENSIONS.PROJECTION_GRID_WIDTH).toBe('570px');
    expect(source).toContain(
      'gridWidth={POPOVER_DIMENSIONS.PROJECTION_GRID_WIDTH}'
    );
  });
});
