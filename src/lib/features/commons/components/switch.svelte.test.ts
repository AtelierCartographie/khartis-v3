import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'switch.svelte'),
  'utf8'
);

describe('Switch', () => {
  it('uses the Khartis blue token for the checked track', () => {
    expect(source).toContain(
      '--_kh-switch-track-on: var(--cds-blue, #0072c3);'
    );
    expect(source).not.toContain('var(--cds-support-02, #198038)');
  });

  it('keeps the small switch compact', () => {
    expect(source).toContain('--_kh-switch-width: 32px;');
    expect(source).toContain('--_kh-switch-height: 16px;');
    expect(source).toContain('--_kh-switch-knob-size: 10px;');
  });
});
