import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'basemap-card-vertical.svelte'),
  'utf8'
);

describe('BasemapCardVertical', () => {
  it('maps gray and suggestion hover states to figma card and preview tokens', () => {
    expect(source).toContain('--cds-layer-hover-01');
    expect(source).toContain('--cds-layer-hover-02');
    expect(source).toContain('--khartis-additions-layer-hover-01-suggestions');
    expect(source).toContain('--khartis-additions-layer-hover-02-suggestions');
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
});
