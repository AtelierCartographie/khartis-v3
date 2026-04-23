import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'tool-container.svelte'),
  'utf8'
);

describe('tool container', () => {
  it('adds vertical padding around the shared tool header title', () => {
    expect(source).toMatch(
      /padding:\s*var\(--cds-spacing-05\)\s+var\(--cds-spacing-02\)\s+var\(--cds-spacing-04\)\s+var\(--cds-spacing-05\);/
    );
  });

  it('uses a slightly smaller shared tool title size', () => {
    expect(source).toContain('font-size: 0.875rem;');
    expect(source).toContain('line-height: 1.25rem;');
  });

  it('keeps the shared tool surfaces opaque', () => {
    expect(source).toContain('background-color: var(--cds-background, white);');
    expect(source).toContain('background-color: inherit;');
  });

  it('closes through the shared panel close handler', () => {
    expect(source).toContain('import { closeSelectedToolPanel }');
    expect(source).toContain('closeSelectedToolPanel();');
  });
});
