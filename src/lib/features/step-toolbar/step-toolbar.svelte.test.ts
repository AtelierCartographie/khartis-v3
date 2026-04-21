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
      'min(58vh, calc(100dvh - 96px))'
    );
  });

  it('keeps tool popovers scrollable without showing the native scrollbar', () => {
    expect(toolPopoverSource).toContain('overflow-y: auto;');
    expect(toolPopoverSource).toContain('scrollbar-width: none;');
    expect(toolPopoverSource).toContain('.popover-scroll::-webkit-scrollbar');
    expect(toolPopoverSource).toContain('display: none;');
  });

  it('does not push shorter right-top popovers downward', () => {
    expect(toolPopoverSource).toContain('computedTopOffset = Math.min(');
    expect(toolPopoverSource).toContain(
      'Math.round((toolbarRect.height - popoverRect.height) / 2)'
    );
  });
});
