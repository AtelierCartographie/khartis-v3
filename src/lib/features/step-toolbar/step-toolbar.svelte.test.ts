import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POPOVER_DIMENSIONS } from './step-toolbar.constants';

const source = readFileSync(
  resolve(import.meta.dirname, 'step-toolbar.svelte'),
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

  it('uses the figma-aligned maximum popover height', () => {
    expect(POPOVER_DIMENSIONS.MAX_HEIGHT).toBe(
      'min(952px, calc(100vh - 64px))'
    );
  });
});
