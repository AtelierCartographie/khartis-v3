import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'tooltip.service.ts'),
  'utf8'
);

describe('tooltip.service — mobile hover policy', () => {
  it('suppresses hover tooltips on mobile and clears pending preview state', () => {
    const hoverHandlerBlock = source
      .split('export function createHoverHandler(')[1]
      ?.split('export function createClickHandler(')[0];

    expect(hoverHandlerBlock).toContain('if (globalState.isMobileView) {');
    expect(hoverHandlerBlock).toContain('clearPendingHoverTooltip();');
    expect(hoverHandlerBlock).toContain('mapTooltipStore.hide();');
  });
});
