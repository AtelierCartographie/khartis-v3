import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'side-nav.svelte'),
  'utf8'
);

describe('side nav', () => {
  it('keeps ghost actions neutral only in dark theme', () => {
    expect(source).toContain(
      ":global(html[theme='g100'] #khartis-side-nav .menu-bar-item.bx--btn--ghost)"
    );
    expect(source).toContain('color: var(--cds-text-01)');
    expect(source).not.toContain(':global(:root) #khartis-side-nav');
  });

  it('renders the version label from an environment variable', () => {
    expect(source).toContain('import.meta.env.VITE_APP_VERSION');
    expect(source).toContain('DEFAULT_APP_VERSION');
    expect(source).toContain('m.sidenav_version({ version: appVersion })');
  });

  it('strips a leading v from the env-injected version to avoid double "vv"', () => {
    expect(source).toMatch(/\.replace\(\s*\/\^v\/i\s*,\s*['"]['"]\s*\)/);
  });
});
