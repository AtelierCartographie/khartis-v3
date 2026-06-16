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

  it('keeps install dialog notification text inside the blue notification block', () => {
    expect(source).toContain(
      '<div class="install-help-notification" role="alert">'
    );
    expect(source).toContain('class="install-help-notification-copy"');
    expect(source).toContain('box-sizing: border-box;');
    expect(source).toContain('grid-template-columns: 1.25rem minmax(0, 1fr);');
    expect(source).toContain(
      'background-color: var(--cds-notification-background-info);'
    );
    expect(source).toContain('border-left: 3px solid var(--cds-support-info);');
    expect(source).toContain('flex-direction: column;');
    expect(source).toContain('overflow-wrap: anywhere;');
    expect(source).toContain('word-break: normal;');
  });
});
