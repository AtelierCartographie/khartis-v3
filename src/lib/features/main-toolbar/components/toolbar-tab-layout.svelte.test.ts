import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'toolbar-tab-layout.svelte'),
  'utf8'
);

describe('ToolbarTabLayout', () => {
  it('uses the shared toolbar background and surface tokens', () => {
    expect(source).toContain('--khartis-main-toolbar-background');
    expect(source).toContain('--khartis-main-toolbar-surface-background');
    expect(source).toContain('var(--cds-ui-01, #f4f4f4)');
    expect(source).toContain('var(--cds-ui-02, #ffffff)');
  });
});
