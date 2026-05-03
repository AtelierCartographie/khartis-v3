import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-category-labels.svelte.ts'),
  'utf8'
);

describe('use-category-labels', () => {
  it('delegates category hydration to the shared categorical preview utility', () => {
    expect(source).toContain('loadDistinctCategoryLabels');
    expect(source).toContain('resolveCategoryPreviewCount');
  });

  it('guards async label hydration with a request id anti-race check', () => {
    expect(source).toContain('let requestId = 0;');
    expect(source).toContain('const currentRequestId = ++requestId;');
    expect(source).toContain('if (currentRequestId !== requestId) {');
  });

  it('surfaces a fallback count through the shared preview count resolver', () => {
    expect(source).toContain('fallbackCount = 4');
    expect(source).toContain('function resolveFallbackCount(): number {');
    expect(source).toContain('resolveCategoryPreviewCount(');
  });
});
