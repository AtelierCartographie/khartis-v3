import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection.svelte'),
  'utf8'
);

describe('Projection tool shell', () => {
  it('uses symmetric body padding so all projection sections can fill the popover width', () => {
    expect(source).toContain(
      '--khartis-expandable-section-body-padding: 8px 16px 24px 16px;'
    );
  });

  it('keeps visible separators between projection expandable sections', () => {
    expect(source).toContain(
      ':global(.section-container + .section-container)'
    );
    expect(source).toContain(
      'border-top: 1px solid var(--cds-border-subtle-00, #e0e0e0);'
    );
  });

  it('applies parsed CRS metadata before storing the custom code', () => {
    expect(
      source.indexOf('projectionActions.setSelected(parsed.projectionId);')
    ).toBeLessThan(
      source.indexOf('projectionActions.setCustomCode(parsed.normalizedCode);')
    );
  });
});
