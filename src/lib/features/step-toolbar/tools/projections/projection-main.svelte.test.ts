import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-main.svelte'),
  'utf8'
);

describe('ProjectionMain', () => {
  it('renders expanded mode as a three-column css grid', () => {
    expect(source).toContain('const gridProjections = $derived(');
    expect(source).toContain('GROUPS.flatMap((group) =>');
    expect(source).toContain("{#each gridProjections as p (p.id + '-grid')}");
    expect(source).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));'
    );
    expect(source).toContain('grid-auto-rows: 19rem;');
    expect(source).toContain('align-items: stretch;');
    expect(source).toContain('.projection-grid :global(.projection-card) {');
  });
});
