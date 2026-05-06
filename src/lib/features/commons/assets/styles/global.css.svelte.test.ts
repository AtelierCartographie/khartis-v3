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

describe('global Carbon theme compatibility tokens', () => {
  it('defines v11 layer and border aliases used by app styles', () => {
    expect(source).toContain(
      '--khartis-control-surface-background: var(--cds-ui-02, #ffffff);'
    );
    expect(source).toContain('--khartis-control-surface-background: #303030;');
    expect(source).toContain(
      '--cds-layer-01: var(--khartis-control-surface-background);'
    );
    expect(source).toContain(
      '--cds-layer-selected-01: var(--cds-selected-ui);'
    );
    expect(source).toContain('--cds-border-subtle-00: var(--cds-ui-03);');
    expect(source).toContain('--cds-border-strong-01: var(--cds-ui-04);');
    expect(source).toContain('--cds-field-hover-01: var(--cds-hover-ui);');
    expect(source).toContain('--khartis-data-table-header-background');
    expect(source).toContain(
      '--khartis-main-toolbar-background: var(--cds-ui-01, #f4f4f4);'
    );
    expect(source).toContain(
      '--khartis-main-toolbar-background: var(--cds-background, #161616);'
    );
    expect(source).toContain(
      '--khartis-main-toolbar-surface-background: var(--cds-ui-02, #ffffff);'
    );
    expect(source).toContain(
      '--khartis-main-toolbar-surface-background: var(\n    --khartis-control-surface-background\n  );'
    );
    expect(source).toContain('--khartis-palette-swatch-border-color: var(');
    expect(source).toContain('var(--cds-border-subtle-01, #525252)');
  });
});
