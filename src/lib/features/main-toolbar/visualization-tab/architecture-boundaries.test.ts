import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return walkFiles(path);
    }
    return [path];
  });
}

const visualizationTabRoot = resolve(import.meta.dirname, 'components');
const sharedMoveTargets = [
  resolve(import.meta.dirname, '../data-tab'),
  resolve(import.meta.dirname, '../../step-toolbar')
];

describe('visualization tab architecture boundaries', () => {
  it('keeps step-toolbar leaf imports out of visualization leaf components', () => {
    const componentFiles = walkFiles(visualizationTabRoot).filter((filePath) =>
      filePath.endsWith('.svelte')
    );

    for (const filePath of componentFiles) {
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toContain('$lib/features/step-toolbar/tools/');
    }
  });

  it('keeps moved viz controls out of cross-feature imports to visualization-tab/components/shared', () => {
    for (const root of sharedMoveTargets) {
      const files = walkFiles(root).filter((filePath) =>
        filePath.endsWith('.svelte')
      );
      for (const filePath of files) {
        const source = readFileSync(filePath, 'utf8');
        expect(source).not.toContain(
          'visualization-tab/components/shared/info-popover'
        );
        expect(source).not.toContain(
          'visualization-tab/components/shared/section-heading'
        );
        expect(source).not.toContain(
          'visualization-tab/components/shared/slider-with-input'
        );
        expect(source).not.toContain(
          'visualization-tab/components/shared/toggle-with-label'
        );
      }
    }
  });
});
