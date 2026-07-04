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
const sourceRoot = resolve(featuresRoot, '../..');
const routesRoot = resolve(sourceRoot, 'routes');
const commonsRoot = resolve(import.meta.dirname, '../commons');
const visualizationTabRoot = resolve(import.meta.dirname);
const visualizationRoot = resolve(import.meta.dirname, 'components');
const dataTabRoot = resolve(import.meta.dirname, '../data-tab');
const mainToolbarRoot = resolve(import.meta.dirname, '../main-toolbar');
const stepToolbarRoot = resolve(import.meta.dirname, '../step-toolbar');

function isSourceFile(filePath: string): boolean {
  return filePath.endsWith('.svelte') || filePath.endsWith('.ts');
}

function sourceFiles(root: string): string[] {
  return walkFiles(root).filter(isSourceFile);
}

function assertNoForbiddenImports(
  files: string[],
  forbiddenImports: string[],
  label: string
): void {
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    for (const forbiddenImport of forbiddenImports) {
      expect(
        source,
        `${filePath} must not deep-import ${forbiddenImport} (${label})`
      ).not.toContain(forbiddenImport);
    }
  }
}

describe('visualization architecture boundaries', () => {
  it('keeps step-toolbar leaf imports out of visualization components', () => {
    const componentFiles = sourceFiles(visualizationRoot);

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
      const files = sourceFiles(root);
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
    const files = sourceFiles(dataTabRoot);
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      expect(
        source,
        `${filePath} must not deep-import visualization components`
      ).not.toMatch(
        /from ['"].*\$lib\/features\/visualization-tab\/components\//
      );
    }
  });

  it('commons does not import visualization-tab internals', () => {
    const files = sourceFiles(commonsRoot);
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      expect(
        source,
        `${filePath} must not import visualization-tab internals`
      ).not.toMatch(/from ['"].*\$lib\/features\/visualization-tab\//);
    }
  });

  it('step-toolbar tools do not deep-import visualization internals', () => {
    const toolsRoot = resolve(stepToolbarRoot, 'tools');
    const files = sourceFiles(toolsRoot);
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      expect(
        source,
        `${filePath} must not deep-import visualization components`
      ).not.toMatch(/from ['"].*\$lib\/features\/visualization\/components\//);
    }
  });

  it('keeps phase 4 public barrel migrations locked', () => {
    const rules = [
      {
        label: 'main-toolbar public barrel',
        files: [
          ...sourceFiles(routesRoot),
          ...sourceFiles(dataTabRoot),
          ...sourceFiles(visualizationTabRoot)
        ],
        forbiddenImports: [
          '$lib/features/main-toolbar/main-toolbar.svelte',
          '$lib/features/main-toolbar/mobile-toolbar.svelte',
          '$lib/features/main-toolbar/components/toolbar-tab-layout.svelte'
        ]
      },
      {
        label: 'visualization-tab public barrel',
        files: sourceFiles(mainToolbarRoot),
        forbiddenImports: [
          '$lib/features/visualization-tab/components/',
          '$lib/features/visualization-tab/services/suggestion.service',
          '$lib/features/visualization-tab/utils/suggestion-selection.utils'
        ]
      },
      {
        label: 'map public barrel from step-toolbar',
        files: sourceFiles(stepToolbarRoot),
        forbiddenImports: [
          '$lib/features/map/stores/osm-basemap.store.svelte',
          '$lib/features/map/stores/projection.store.svelte',
          '$lib/features/map/stores/basemap-layers.store.svelte',
          '$lib/features/map/stores/map-projection.store.svelte',
          '$lib/features/map/stores/map-highlight.store.svelte',
          '$lib/features/map/services/basemap.service.svelte'
        ]
      },
      {
        label: 'project-management core barrel',
        files: [
          ...sourceFiles(featuresRoot),
          ...sourceFiles(routesRoot)
        ].filter((filePath) => !filePath.includes('/project-management/core/')),
        forbiddenImports: [
          '$lib/features/project-management/core/persistence-registry'
        ]
      },
      {
        label: 'duckdb public barrel in migrated consumers',
        files: [
          resolve(
            featuresRoot,
            'commons/services/data-orchestrator.service.svelte.ts'
          ),
          resolve(featuresRoot, 'header/services/export.service.ts'),
          resolve(featuresRoot, 'map/hooks/use-map-layers.svelte.ts'),
          resolve(
            featuresRoot,
            'project-management/services/serializer.service.ts'
          )
        ],
        forbiddenImports: [
          '$lib/features/duckdb/duck',
          '$lib/features/duckdb/orchestrator/orchestrator.svelte',
          '$lib/features/duckdb/types',
          '$lib/features/duckdb/constants'
        ]
      },
      {
        label: 'mobile/example feature barrels',
        files: [
          resolve(featuresRoot, 'main-toolbar/mobile-toolbar.svelte'),
          resolve(
            featuresRoot,
            'create-project/components/try-with-example.svelte'
          )
        ],
        forbiddenImports: [
          '$lib/features/map/services/basemap-catalog.service.svelte',
          '$lib/features/duckdb/orchestrator/gps-ops',
          '$lib/features/duckdb/orchestrator/orchestrator.svelte',
          '$lib/features/data-tab/stores/data-tab.store.svelte',
          '$lib/features/data-tab/services/persisted-basemap.service',
          '$lib/features/data-tab/services/tabular-source-snapshot.service',
          '$lib/features/step-toolbar/tool-popover.svelte',
          '$lib/features/step-toolbar/tools/tool-container.svelte',
          '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte',
          '$lib/features/step-toolbar/tools/legend/legend.store.svelte',
          '$lib/features/step-toolbar/tools-list/tool-list.utils.svelte'
        ]
      },
      {
        label: 'step-toolbar font barrel in map layers',
        files: [
          resolve(featuresRoot, 'map/layers/layer-factory.ts'),
          resolve(featuresRoot, 'map/layers/basemap-layers.ts')
        ],
        forbiddenImports: ['$lib/features/step-toolbar/fonts.constants']
      }
    ];

    for (const rule of rules) {
      assertNoForbiddenImports(rule.files, rule.forbiddenImports, rule.label);
    }
  });

  it('keeps pattern type ownership in commons constants', () => {
    const oldPatternImport =
      /import\s+(?:type\s+)?\{[^}]*\bPattern(?:Type|Params)\b[^}]*\}\s+from ['"]\$lib\/features\/commons\/(?:stores\/visualization\.store\.svelte|components\/palette-popover\/categories-aspect-popover\.types)['"]/;

    for (const filePath of sourceFiles(featuresRoot)) {
      const source = readFileSync(filePath, 'utf8');
      expect(
        source,
        `${filePath} must import PatternType/PatternParams from commons constants`
      ).not.toMatch(oldPatternImport);
    }
  });

  it('no feature imports from another feature deep subdirectory (step-toolbar/tools/<tool>/<internals>)', () => {
    const allFeatureFiles = sourceFiles(featuresRoot).filter(
      (filePath) => !filePath.includes('/node_modules/')
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
