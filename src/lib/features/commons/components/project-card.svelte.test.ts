import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'project-card.svelte'),
  'utf8'
);

describe('ProjectCard', () => {
  it('keeps loaded thumbnails on a white preview surface without hover recoloring', () => {
    expect(source).toContain('.top-section.has-thumbnail');
    expect(source).toContain('object-fit: contain;');
    expect(source).toContain('width: 100%;');
    expect(source).toContain('height: 100%;');
    expect(source).toContain('background: #ffffff;');
    expect(source).toContain(
      '#kh-card:hover:not(.opacity-50) .top-section:not(.has-thumbnail)'
    );
    expect(source).toContain('.top-section.variant-gray:not(.has-thumbnail)');
  });

  it('shows the full title through a tooltip only when the rendered title overflows', () => {
    expect(source).toContain(
      "import { overflowTitle } from '../utils/overflow-title';"
    );
    expect(source).toContain('use:overflowTitle={title}');
  });
});
