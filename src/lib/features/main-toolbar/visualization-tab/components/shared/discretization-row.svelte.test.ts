import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'discretization-row.svelte'),
  'utf8'
);

describe('DiscretizationRow', () => {
  it('accepts a custom settingsIconDescription for non-discretization actions', () => {
    expect(source).toContain('settingsIconDescription?: string;');
    expect(source).toContain(
      'settingsIconDescription = m.discretization_settings()'
    );
    expect(source).toContain('iconDescription={settingsIconDescription}');
  });

  it('forwards the click event to the caller so the parent can stop propagation when needed', () => {
    expect(source).toContain('onsettings?: (event: MouseEvent) => void;');
    expect(source).toContain('on:click={(event) => onsettings?.(event)}');
  });
});
