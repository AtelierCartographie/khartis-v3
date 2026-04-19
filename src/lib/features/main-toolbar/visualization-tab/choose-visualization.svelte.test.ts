import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'choose-visualization.svelte'),
  'utf8'
);

describe('ChooseVisualization', () => {
  it('portals the delete confirmation modal and binds its open state', () => {
    expect(source).toContain(
      "import { appendToBody } from '$lib/features/commons/utils/append-to-body';"
    );
    expect(source).toContain('{#if isDeleteConfirmOpen}');
    expect(source).toContain('<div use:appendToBody>');
    expect(source).toContain('bind:open={isDeleteConfirmOpen}');
  });
});
