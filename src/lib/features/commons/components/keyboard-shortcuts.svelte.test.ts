import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'keyboard-shortcuts.svelte'),
  'utf8'
);

describe('KeyboardShortcuts', () => {
  it('maps every visualization and styling tool to an Alt+number shortcut', () => {
    [
      "'1': VisualizationTools.Search",
      "'2': VisualizationTools.Layers",
      "'3': VisualizationTools.Projection",
      "'4': VisualizationTools.Simplification",
      "'5': VisualizationTools.Facets",
      "'1': StylingTools.Format",
      "'2': StylingTools.Legend",
      "'3': StylingTools.GeoIndications",
      "'4': StylingTools.Annotations",
      "'5': StylingTools.ColorBlindness"
    ].forEach((shortcut) => expect(source).toContain(shortcut));
  });

  it('handles tool shortcuts only with the Alt modifier', () => {
    expect(source).toContain('handleToolShortcut(event)');
    expect(source).toContain('event.altKey');
    expect(source).toContain('!event.ctrlKey');
    expect(source).toContain('!event.metaKey');
    expect(source).toContain('!event.shiftKey');
  });
});
