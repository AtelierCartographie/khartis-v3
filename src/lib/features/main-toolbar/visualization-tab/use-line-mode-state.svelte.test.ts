import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-line-mode-state.svelte.ts'),
  'utf8'
);

describe('use-line-mode-state source', () => {
  it('stores independent color and thickness snapshots for line mode switches', () => {
    expect(source).toContain('snapshotLineColorModeState');
    expect(source).toContain('snapshotLineThicknessModeState');
    expect(source).toContain('colorModeStates');
    expect(source).toContain('thicknessModeStates');
    expect(source).toContain('resolveSharedValueColumn');
  });
});
