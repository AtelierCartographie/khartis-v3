import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-card.svelte'),
  'utf8'
);

describe('ProjectionCard', () => {
  it('maps hover states to figma card tokens while keeping previews white', () => {
    expect(source).toContain('--khartis-additions-layer-hover-01-suggestions');
    expect(source).toContain('background: #ffffff;');
    expect(source).toContain('min-height: 120px;');
    expect(source).toContain('align-self: stretch;');
    expect(source).toContain('align-items: center;');
    expect(source).not.toContain(
      '.projection-card--suggestion:hover:not(.disabled) .preview-section'
    );
    expect(source).not.toContain(
      '.projection-card--default:hover:not(.disabled) .preview-section'
    );
  });

  it('positions the radio in the title area to match the projection card design', () => {
    expect(source).toContain('class="title-radio kh-card-radio"');
    expect(source).toContain('.title-radio {');
    expect(source).not.toContain('class="preview-radio kh-card-radio"');
  });

  it('keeps the preview radio accessible without showing duplicate card text', () => {
    expect(source).toContain('labelText={title}');
    expect(source).toContain('hideLabel');
  });

  it('maps the radio theme to card-specific CSS variables', () => {
    expect(source).toContain('--kh-card-radio-color');
    expect(source).toContain('--kh-card-radio-focus-color');
    expect(source).toContain('--kh-card-radio-color: #003a6d;');
    expect(source).toContain('--kh-card-radio-color: #161616;');
  });

  it('renders the equal-area affordance as Figma surface metadata', () => {
    expect(source).toContain('class="surface-indicator"');
    expect(source).toContain('<CheckmarkFilled size={16} />');
    expect(source).toContain('class="projection-tag-pill"');
  });

  it('draws the selected state above the card content so previews cannot clip it', () => {
    expect(source).toContain('.projection-card.selected::after');
    expect(source).toContain('z-index: 2;');
    expect(source).toContain(
      'border: 3px solid var(--projection-card-focus-color);'
    );
  });

  it('renders a dynamic simplified projection preview', () => {
    expect(source).toContain(
      "import ProjectionPreview from '$lib/features/commons/components/projection-preview.svelte';"
    );
    expect(source).toContain('{projectionId}');
    expect(source).not.toContain('icon="none"');
  });

  it('shows the full title through a tooltip only when the rendered title overflows', () => {
    expect(source).toContain(
      "import { overflowTitle } from '../utils/overflow-title';"
    );
    expect(source).toContain('use:overflowTitle={title}');
  });
});
