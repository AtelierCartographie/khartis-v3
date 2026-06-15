import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'open-project.svelte'),
  'utf8'
);

describe('OpenProject', () => {
  it('portals the delete confirmation modal outside the parent create-project modal', () => {
    expect(source).toContain(
      "import { appendToBody } from '$lib/features/commons/utils/append-to-body';"
    );
    expect(source).toContain('{#if showDeleteConfirm}');
    expect(source).toContain('<div use:appendToBody>');
    expect(source).toContain('bind:open={showDeleteConfirm}');
  });

  it('uses neutral gray cards for saved backup previews', () => {
    expect(source).toContain('variant="gray"');
    expect(source).not.toContain('variant="blue"');
  });
});
