import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection.store.svelte.ts'),
  'utf8'
);

describe('projection store', () => {
  it('clears the manual projection override when the active card is toggled', () => {
    expect(source).toContain('toggleSelected: (projectionId: string) => void;');
    expect(source).toContain('const clearSelectedInternal =');
    expect(source).toContain('s.overrideActive = false;');
    expect(source).toContain('s.overrideSource = undefined;');
    expect(source).toContain(
      'mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);'
    );
  });
});
