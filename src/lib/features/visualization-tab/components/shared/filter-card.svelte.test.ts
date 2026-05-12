import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'filter-card.svelte'),
  {
    encoding: 'utf8'
  }
);

describe('FilterCard — Carbon TextInput events', () => {
  it('reads TextInput values from event.detail before falling back to the target', () => {
    expect(source).toContain('function readTextInputValue');
    expect(source).toContain('const detail = event.detail;');
    expect(source).toContain('value: readTextInputValue(e)');
    expect(source).toContain('secondaryValue: readTextInputValue(e)');
    expect(source).not.toContain('(e.target as HTMLInputElement).value');
  });
});
