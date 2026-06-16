import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function walkFiles(dir: string, excludeTests = true): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return walkFiles(path, excludeTests);
    }
    if (excludeTests && (path.includes('.test.') || path.includes('.spec.'))) {
      return [];
    }
    return [path];
  });
}

const featuresRoot = resolve(import.meta.dirname, '..');
const visualizationRoot = resolve(import.meta.dirname, 'components');
const dataTabRoot = resolve(import.meta.dirname, '../data-tab');
const stepToolbarRoot = resolve(import.meta.dirname, '../step-toolbar');

describe('visualization architecture boundaries', () => {
  it('keeps step-toolbar leaf imports out of visualization components', () => {
    const componentFiles = walkFiles(visualizationRoot).filter(
      (filePath) => filePath.endsWith('.svelte') || filePath.endsWith('.ts')
    );

    for (const filePath of componentFiles) {
      const source = readFileSync(filePath, 'utf8');
      expect(
        source,
        `${filePath} must not deep-import step-toolbar tools`
      ).not.toContain('$lib/features/step-toolbar/tools/');
    }
  });

  it('keeps old visualization-tab deep paths out of data-tab and step-toolbar', () => {
    const oldDeepPaths = [
      'visualization-tab/components/shared/info-popover',
      'visualization-tab/components/shared/section-heading',
      'visualization-tab/components/shared/slider-with-input',
      'visualization-tab/components/shared/toggle-with-label'
    ];

    for (const root of [dataTabRoot, stepToolbarRoot]) {
      const files = walkFiles(root).filter(
        (filePath) => filePath.endsWith('.svelte') || filePath.endsWith('.ts')
      );
      for (const filePath of files) {
        const source = readFileSync(filePath, 'utf8');
        for (const forbidden of oldDeepPaths) {
          expect(
            source,
            `${filePath} must not reference ${forbidden}`
          ).not.toContain(forbidden);
        }
      }
    }
  });

  it('data-tab does not deep-import visualization internals', () => {
    const files = walkFiles(dataTabRoot).filter(
      (filePath) => filePath.endsWith('.svelte') || filePath.endsWith('.ts')
    );
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      expect(
        source,
        `${filePath} must not deep-import visualization components`
      ).not.toMatch(/from ['"].*\$lib\/features\/visualization\/components\//);
    }
  });

  it('step-toolbar tools do not deep-import visualization internals', () => {
    const toolsRoot = resolve(stepToolbarRoot, 'tools');
    const files = walkFiles(toolsRoot).filter(
      (filePath) => filePath.endsWith('.svelte') || filePath.endsWith('.ts')
    );
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      expect(
        source,
        `${filePath} must not deep-import visualization components`
      ).not.toMatch(/from ['"].*\$lib\/features\/visualization\/components\//);
    }
  });

  it('no feature imports from another feature deep subdirectory (step-toolbar/tools/<tool>/<internals>)', () => {
    const allFeatureFiles = walkFiles(featuresRoot).filter(
      (filePath) =>
        (filePath.endsWith('.svelte') || filePath.endsWith('.ts')) &&
        !filePath.includes('/node_modules/')
    );

    for (const filePath of allFeatureFiles) {
      const featureMatch = filePath.match(/features\/([\w-]+)\//);
      if (!featureMatch) continue;
      const ownFeature = featureMatch[1];

      const source = readFileSync(filePath, 'utf8');

      const deepToolImport =
        /from ['"].*\$lib\/features\/step-toolbar\/tools\/[\w-]+\/(?!index)(?:[^'"]+(?<!\.svelte))['"]/g;
      const matches = [...source.matchAll(deepToolImport)];
      for (const match of matches) {
        if (
          filePath.includes('/step-toolbar/') &&
          ownFeature === 'step-toolbar'
        ) {
          continue;
        }
        expect.fail(
          `${filePath} must import step-toolbar tools via their index.ts, not: ${match[0]}`
        );
      }
    }
  });
});
