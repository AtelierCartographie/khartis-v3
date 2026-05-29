import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'pattern-picker.svelte'),
  'utf8'
);

describe('PatternPicker', () => {
  it('should expose angle options for line patterns (0°, 45°, 315°)', () => {
    expect(source).toContain("label: '0°'");
    expect(source).toContain("label: '45°'");
    expect(source).toContain("label: '315°'");
    expect(source).toContain("patternId: 'horizontal'");
    expect(source).toContain("patternId: 'diagonal'");
    expect(source).toContain("patternId: 'diagonal-reverse'");
  });
});
