import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'thematic-map.svelte'),
  'utf8'
);

describe('ThematicMap projection mask overlay', () => {
  it('only enables the projection mask for manual overrides and uses an even-odd path fill', () => {
    expect(source).toContain('class="projection-mask-overlay"');
    expect(source).toContain(
      "getProjectionState().overrideSource !== 'manual'"
    );
    expect(source).toContain('fill-rule="evenodd"');
    expect(source).toContain('clip-rule="evenodd"');
  });
});
