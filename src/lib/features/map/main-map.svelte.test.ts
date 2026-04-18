import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'main-map.svelte'),
  'utf8'
);

describe('MainMap density mode loading', () => {
  it('detects density visualizations from the polygon fill mode (issue #93)', () => {
    expect(source).toContain('getPolygonPrimitive(viz)?.fillMode');
    expect(source).toContain('FillMode.DENSITY');
    expect(source).not.toContain('SymbolMode.DENSITY');
  });
});
