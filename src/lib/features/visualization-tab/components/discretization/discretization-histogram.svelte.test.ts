import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'discretization-histogram.svelte'),
  'utf8'
);

describe('DiscretizationHistogram', () => {
  it('renders class bars in interval rows between threshold rows', () => {
    const thresholdRowIndex = source.indexOf('class="histogram-threshold-row"');
    const intervalRowIndex = source.indexOf('class="histogram-interval-row"');

    expect(thresholdRowIndex).toBeGreaterThan(-1);
    expect(intervalRowIndex).toBeGreaterThan(thresholdRowIndex);

    const thresholdRowBlock = source.slice(thresholdRowIndex, intervalRowIndex);
    const intervalRowBlock = source.slice(
      intervalRowIndex,
      source.indexOf('{/each}')
    );

    expect(thresholdRowBlock).toContain('<TextInput');
    expect(thresholdRowBlock).not.toContain('class="histogram-bar"');
    expect(intervalRowBlock).toContain('class="histogram-bar"');
  });
});
