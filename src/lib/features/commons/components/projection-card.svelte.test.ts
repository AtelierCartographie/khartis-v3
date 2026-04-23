import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-card.svelte'),
  'utf8'
);

describe('ProjectionCard', () => {
  it('maps hover states to figma hover tokens for card and preview', () => {
    expect(source).toContain('--khartis-additions-layer-hover-01-suggestions');
    expect(source).toContain('--khartis-additions-layer-hover-02-suggestions');
  });

  it('positions the radio in the preview area for all card layouts', () => {
    expect(source).toContain('class="preview-radio kh-card-radio"');
    expect(source).toContain('position: absolute;');
    expect(source).toContain('top: 8px;');
    expect(source).toContain('left: 8px;');
    expect(source).not.toContain('class="radio-wrapper kh-card-radio"');
  });

  it('maps the radio theme to card-specific CSS variables', () => {
    expect(source).toContain('--kh-card-radio-color');
    expect(source).toContain('--kh-card-radio-focus-color');
    expect(source).toContain('--kh-card-radio-color: #003a6d;');
    expect(source).toContain('--kh-card-radio-color: #161616;');
  });
});
