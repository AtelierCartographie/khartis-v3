import { describe, expect, it } from 'vitest';
import '$lib/features/commons/stores/locale.store.svelte';
import { setLocale } from '$lib/paraglide/runtime.js';
import * as m from '$lib/paraglide/messages';
import { createOSMBasemap } from './basemap-import.service';

async function setTestLocale(locale: 'fr' | 'en'): Promise<void> {
  await Promise.resolve(setLocale(locale, { reload: false }));
}

describe('createOSMBasemap', () => {
  it('stores separate French and English metadata labels regardless of the active locale', async () => {
    await setTestLocale('fr');

    const basemapFromFrenchUi = createOSMBasemap();

    expect(basemapFromFrenchUi.title_fr).toBe(
      m.basemap_osm({}, { locale: 'fr' })
    );
    expect(basemapFromFrenchUi.title_en).toBe(
      m.basemap_osm({}, { locale: 'en' })
    );
    expect(basemapFromFrenchUi.subtitle_fr).toBe(
      m.osm_basemap_description({}, { locale: 'fr' })
    );
    expect(basemapFromFrenchUi.subtitle_en).toBe(
      m.osm_basemap_description({}, { locale: 'en' })
    );
    expect(basemapFromFrenchUi.layers[0]?.title_fr).toBe(
      m.layer_title_base({}, { locale: 'fr' })
    );
    expect(basemapFromFrenchUi.layers[0]?.title_en).toBe(
      m.layer_title_base({}, { locale: 'en' })
    );

    await setTestLocale('en');

    const basemapFromEnglishUi = createOSMBasemap();

    expect(basemapFromEnglishUi.title_fr).toBe(
      m.basemap_osm({}, { locale: 'fr' })
    );
    expect(basemapFromEnglishUi.title_en).toBe(
      m.basemap_osm({}, { locale: 'en' })
    );
  });
});
