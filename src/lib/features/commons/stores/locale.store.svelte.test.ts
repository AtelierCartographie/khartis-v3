import { afterEach, describe, expect, it } from 'vitest';
import './locale.store.svelte';
import { getLocale, setLocale } from '$lib/paraglide/runtime.js';

async function setTestLocale(locale: 'fr' | 'en'): Promise<void> {
  await Promise.resolve(setLocale(locale, { reload: false }));
}

describe('locale store', () => {
  afterEach(async () => {
    await setTestLocale('fr');
  });

  it('syncs the html lang attribute when the locale changes without reload', async () => {
    document.documentElement.lang = 'fr';

    await setTestLocale('en');

    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    await setTestLocale('fr');

    expect(getLocale()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
