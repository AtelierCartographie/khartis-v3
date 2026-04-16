import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'configure-visualization.svelte'),
  'utf8'
);

describe('ConfigureVisualization', () => {
  it('keeps primitive panels mounted and disables unsupported geometry tools', () => {
    expect(source).not.toContain('{#if showsSymbolsConfig}');
    expect(source).not.toContain('{#if showsPolygonsConfig}');
    expect(source).not.toContain('{#if showsLinesConfig}');

    expect(source).toContain('disabled={!showsSymbolsConfig}');
    expect(source).toContain('disabled={!showsPolygonsConfig}');
    expect(source).toContain('disabled={!showsLinesConfig}');
  });
});
