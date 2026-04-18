import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'zoom-toolbar.svelte'),
  'utf8'
);

describe('ZoomToolbar debug panel', () => {
  it('renders a compact dev-only deck panel with a stacked mode header and a mobile top bar layout', () => {
    expect(source).toContain('showDeckDebugPanel && deckDebugViewMode');
    expect(source).toContain('const showDeckDebugPanel = import.meta.env.DEV;');
    expect(source).toContain('class="zoom-toolbar-shell"');
    expect(source).toContain('class="zoom-debug-panel"');
    expect(source).toContain('class="zoom-debug-content"');
    expect(source).toContain('class="zoom-debug-header"');
    expect(source).toContain('class="zoom-debug-metrics"');
    expect(source).not.toContain('{m.deck_debug_badge_dev()}');
    expect(source).toContain('display: flex;');
    expect(source).toContain('gap: 8px;');
    expect(source).toContain('height: 84px;');
    expect(source).toContain('flex-direction: column;');
    expect(source).toContain('border-radius: 999px;');
    expect(source).toContain('background: color-mix(');
    expect(source).toContain('.zoom-debug-panel::before');
    expect(source).not.toContain('border: 1px solid');
    expect(source).not.toContain('text-decoration: underline;');
    expect(source).toContain(
      'top: calc(var(--cds-header-height) + var(--cds-spacing-03));'
    );
    expect(source).toContain('position: fixed;');
    expect(source).toContain('height: 56px;');
  });

  it('limits the panel to the core deck metrics useful for debugging and adds dynamic click tooltips', () => {
    expect(source).toContain('m.deck_debug_metric_fps()');
    expect(source).toContain('m.deck_debug_metric_cpu()');
    expect(source).toContain('m.deck_debug_metric_gpu()');
    expect(source).toContain('m.deck_debug_metric_layers()');
    expect(source).toContain('{#if metric.insight}');
    expect(source).toContain('class="zoom-debug-label">{metric.label}</span>');
    expect(source).toContain('<Tooltip');
    expect(source).toContain('triggerText={metric.label}');
    expect(source).toContain('class="zoom-debug-tooltip-card"');
    expect(source).toContain('class="zoom-debug-tooltip-value">{metric.value}');
    expect(source).toContain(
      'class="zoom-debug-tooltip-text">{metric.insight}'
    );
    expect(source).toContain('getFpsInsight(');
    expect(source).toContain('getCpuInsight(');
    expect(source).toContain('getGpuInsight(');
    expect(source).not.toContain('getLayersInsight()');
    expect(source).not.toContain('VRAM');
    expect(source).not.toContain('PICK');
    expect(source).not.toContain('DPR');
    expect(source).not.toContain('TGT');
  });
});
