import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import '$lib/features/commons/stores/locale.store.svelte';
import { setLocale } from '$lib/paraglide/runtime.js';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import BasemapCardVertical from './basemap-card-vertical.svelte';

const source = readFileSync(
  resolve(import.meta.dirname, 'basemap-card-vertical.svelte'),
  'utf8'
);

function createBasemap(
  overrides: Partial<BasemapMetadata> = {}
): BasemapMetadata {
  return {
    file: 'world',
    title_fr: 'Monde',
    title_en: 'World',
    subtitle_fr: 'Planisphere',
    subtitle_en: 'Planisphere',
    source: 'Natural Earth',
    date: '2026',
    bbox: [-180, -90, 180, 90],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'identity' },
    layers: [],
    ...overrides
  };
}

async function setTestLocale(locale: 'fr' | 'en'): Promise<void> {
  await Promise.resolve(setLocale(locale, { reload: false }));
  await tick();
}

describe('BasemapCardVertical', () => {
  afterEach(async () => {
    cleanup();
    await setTestLocale('fr');
  });

  it('maps hover states to card tokens while keeping previews white', () => {
    expect(source).toContain('--cds-layer-hover-01');
    expect(source).toContain('--khartis-additions-layer-hover-01-suggestions');
    expect(source).toContain('background: #ffffff;');
    expect(source).not.toContain(
      '.basemap-card--suggestion:hover:not(.disabled) .preview-section'
    );
    expect(source).not.toContain(
      '.basemap-card--default:hover:not(.disabled) .preview-section'
    );
  });

  it('uses explicit disabled tokens instead of fading the whole card', () => {
    expect(source).not.toContain('opacity: 0.5;');
    expect(source).toContain('--cds-text-disabled');
    expect(source).toContain('--khartis-additions-text-disabled-suggestions');
  });

  it('positions the radio in the preview area', () => {
    expect(source).toContain('class="preview-radio kh-card-radio"');
    expect(source).toContain('position: absolute;');
    expect(source).toContain('top: 8px;');
    expect(source).toContain('right: 8px;');
    expect(source).not.toContain('use:stackCardHeader');
  });

  it('uses SimpleRadio so the card click handler is the single source of selection', () => {
    expect(source).toContain('<SimpleRadio');
    expect(source).toContain('checked={selected}');
    expect(source).not.toContain('import { RadioButton');
  });

  it('keeps the preview radio accessible without showing duplicate card text', () => {
    expect(source).toContain('labelText={title}');
    expect(source).toContain('hideLabel');
  });

  it('maps the radio theme to gray and suggestion card variables', () => {
    expect(source).toContain('--kh-card-radio-color');
    expect(source).toContain('--kh-card-radio-disabled-color');
    expect(source).toContain('--kh-card-radio-color: #003a6d;');
    expect(source).toContain('--kh-card-radio-color: #161616;');
  });

  it('can hide catalogue metadata for reused gray cards', () => {
    expect(source).toContain('showMetadata = true');
    expect(source).toContain('{#if showMetadata}');
  });

  it('uses lazy static thumbnails for catalog basemaps with a shared fallback', () => {
    expect(source).toContain(
      "import ThumbnailPreview from '$lib/features/commons/components/thumbnail-preview.svelte';"
    );
    expect(source).toContain('/basemaps/thumbnails/${thumbnailBaseName}.avif');
    expect(source).toContain('objectFit="contain"');
  });

  it('updates catalogue labels when the locale changes without a reload', async () => {
    await setTestLocale('fr');

    render(BasemapCardVertical, {
      basemap: createBasemap()
    });

    expect(screen.getByText('Monde')).toBeInTheDocument();

    await setTestLocale('en');

    expect(screen.getByText('World')).toBeInTheDocument();
    expect(screen.queryByText('Monde')).not.toBeInTheDocument();
  });

  it('derives OSM card labels from the active locale instead of persisted metadata', async () => {
    await setTestLocale('fr');

    render(BasemapCardVertical, {
      basemap: createBasemap({
        file: 'osm_openstreetmap_123',
        title_fr: 'Fond de référence',
        title_en: 'Fond de référence',
        subtitle_fr: 'Ancienne description française',
        subtitle_en: 'Ancienne description française',
        source: 'Contributeurs OpenStreetMap'
      })
    });

    expect(screen.getByText('Fond de référence')).toBeInTheDocument();

    await setTestLocale('en');

    expect(screen.getByText('Reference background')).toBeInTheDocument();
    expect(screen.getByText('OpenStreetMap contributors')).toBeInTheDocument();
  });
});
