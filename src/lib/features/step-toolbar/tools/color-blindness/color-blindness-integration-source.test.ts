import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const files = [
  'src/lib/features/commons/services/data-orchestrator.service.svelte.ts',
  'src/lib/features/main-toolbar/visualization-tab/components/discretization-modal.svelte',
  'src/lib/features/main-toolbar/visualization-tab/configure-visualization.svelte',
  'src/lib/features/main-toolbar/visualization-tab/use-compute-breaks.svelte.ts'
] as const;

describe('color blindness integrations', () => {
  it.each(files)('%s uses the shared active-state helper', (filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).toContain('isColorBlindnessActive');
    expect(source).not.toContain('getColorBlindnessState().enabled');
  });
});
