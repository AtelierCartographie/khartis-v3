import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'basemap-osm-tab.svelte'),
  'utf8'
);

describe('BasemapOsmTab interactions', () => {
  it('uses Svelte 5 click handlers for the reference basemap actions', () => {
    expect(source).toContain(
      "import Button from '$lib/features/commons/components/carbon/button.svelte'"
    );
    expect(source).toContain('on:click={onSelectOSM}');
    expect(source).toContain('<a href={resolve(\'/\')} class="bx--link"');
    expect(source).toContain('onclick={handleLinkClick}');
    expect(source).not.toContain('Button, InlineNotification');
    expect(source).not.toContain('Link } from');
    expect(source).not.toContain('<button');
    expect(source).not.toContain('<Link');
  });
});
