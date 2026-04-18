import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'main-map.svelte'),
  'utf8'
);

describe('MainMap density mode loading', () => {
  it('detects density visualizations from the canonical symbol primitive mode', () => {
    expect(source).toContain('getSymbolPrimitive(viz)?.mode');
    expect(source).not.toContain('viz.modes?.symbol !== SymbolMode.DENSITY');
  });
});
