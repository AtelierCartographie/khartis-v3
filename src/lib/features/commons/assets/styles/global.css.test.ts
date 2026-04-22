import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, 'global.css'), 'utf8');

describe('global card radio styles', () => {
  it('overrides Carbon radio spacing and colors through scoped CSS variables', () => {
    expect(source).toContain('.kh-card-radio');
    expect(source).toContain('.kh-card-radio .bx--radio-button__label');
    expect(source).toContain('margin-right: 0;');
    expect(source).toContain('--kh-card-radio-color');
    expect(source).toContain(
      '.kh-card-radio\n  .bx--radio-button:checked\n  + .bx--radio-button__label\n  .bx--radio-button__appearance::before'
    );
  });
});
