import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'missing-data-section.svelte'),
  'utf8'
);

describe('MissingDataSection — pattern control', () => {
  it('keeps the pattern toggle opt-in and reports changes to the caller', () => {
    expect(source).toContain('showPatternToggle?: boolean;');
    expect(source).toContain('pattern?: boolean;');
    expect(source).toContain('onpatternchange?: (pattern: boolean) => void;');
    expect(source).toContain('function handlePatternToggle');
    expect(source).toContain('{#if showPatternToggle}');
    expect(source).toContain('label={m.pattern()}');
    expect(source).toContain('ontoggle={handlePatternToggle}');
  });
});
