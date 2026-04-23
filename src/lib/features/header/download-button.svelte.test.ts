import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'download-button.svelte'),
  'utf8'
);

describe('download button', () => {
  it('keeps the header action neutral only in dark theme', () => {
    expect(source).toContain(
      ":global(html[theme='g100'] #khartis-download-button .bx--btn--primary)"
    );
    expect(source).toContain(
      'background-color: var(--khartis-control-surface-background)'
    );
    expect(source).not.toContain(':global(:root) #khartis-download-button');
  });
});
