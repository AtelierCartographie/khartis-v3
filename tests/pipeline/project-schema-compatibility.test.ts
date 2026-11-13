import { describe, expect, it } from 'vitest';
import { PROJECT_CONST } from '$lib/features/project-management/constants';
import {
  assertCurrentProjectSchema,
  migrateIfNeeded,
  schemaMigrations
} from '$lib/features/project-management/core/schema-migration';

describe('project schema compatibility', () => {
  it('should keep a continuous migration chain from the public baseline', () => {
    const firstSupportedVersion =
      schemaMigrations[0]?.from ?? PROJECT_CONST.SCHEMA_VERSION;
    const lastSupportedVersion =
      schemaMigrations[schemaMigrations.length - 1]?.to ??
      PROJECT_CONST.SCHEMA_BASELINE_VERSION;

    expect(firstSupportedVersion).toBe(PROJECT_CONST.SCHEMA_BASELINE_VERSION);
    for (let index = 0; index < schemaMigrations.length - 1; index += 1) {
      expect(schemaMigrations[index].to).toBe(schemaMigrations[index + 1].from);
    }
    expect(lastSupportedVersion).toBe(PROJECT_CONST.SCHEMA_VERSION);
  });

  it('should preserve a project already using the current schema', () => {
    const project = {
      manifest: {
        version: PROJECT_CONST.SCHEMA_VERSION,
        name: 'Current project',
        extension: 'preserved'
      },
      data: { extension: 42 }
    };

    expect(migrateIfNeeded(project)).toBe(project);
    expect(() => assertCurrentProjectSchema(project)).not.toThrow();
  });

  it('should migrate a 3.14.0 project to the current schema without touching its data', () => {
    const data = {
      sourceFiles: [
        {
          id: 'geo',
          name: 'communes.geojson',
          enrichmentSnapshot: { assetId: 'asset-enriched', kind: 'primary' }
        }
      ]
    };

    const migrated = migrateIfNeeded({
      manifest: { version: '3.14.0', name: 'Enriched project' },
      data
    });

    expect(migrated.manifest).toEqual({
      version: PROJECT_CONST.SCHEMA_VERSION,
      name: 'Enriched project'
    });
    expect(migrated.data).toEqual(data);
  });

  it('should give a 3.15.0 project a map frame equal to its margins when it is migrated', () => {
    const margins = { top: 40, bottom: 20, left: 32, right: 12 };
    const project = {
      manifest: { version: '3.15.0', name: 'Framed project' },
      data: {
        layoutSettings: {
          format: { width: 842, height: 595, margins },
          legend: { items: [] }
        }
      }
    };

    const migrated = migrateIfNeeded(project);

    expect(migrated.manifest).toEqual({
      version: PROJECT_CONST.SCHEMA_VERSION,
      name: 'Framed project'
    });
    expect(migrated.data).toEqual({
      layoutSettings: {
        format: { width: 842, height: 595, margins, mapFrame: margins },
        legend: { items: [] }
      }
    });
    expect(project.data.layoutSettings.format).not.toHaveProperty('mapFrame');
  });

  it('should leave a 3.15.0 project without a page format unchanged when it is migrated', () => {
    const data = { layoutSettings: { legend: { items: [] } } };

    const migrated = migrateIfNeeded({
      manifest: { version: '3.15.0', name: 'Unformatted project' },
      data
    });

    expect(migrated.data).toEqual(data);
  });

  it('should keep the white background of the motifs of a 3.16.0 project when it is migrated', () => {
    const motif = { shape: 'line', angle: 45, scale: 0.7, color: '#000000' };
    const polygon = {
      fillMode: 'classes',
      classification: { method: 'jenks', classes: 4, pattern: motif },
      missingData: {
        show: true,
        color: '#abcdef',
        pattern: true,
        patternConfig: { shape: 'line', color: '#595959' }
      }
    };
    const project = {
      manifest: { version: '3.16.0', name: 'Hatched project' },
      data: {
        visualization: {
          visualizations: [
            {
              id: 'viz-1',
              polygon,
              origin: {
                mode: 'custom',
                restoreState: { visualization: { polygon } }
              }
            }
          ]
        }
      }
    };

    const migrated = migrateIfNeeded(project) as typeof project;

    const migratedPolygon = {
      ...polygon,
      classification: {
        ...polygon.classification,
        pattern: { ...motif, background: '#ffffff' }
      },
      missingData: {
        ...polygon.missingData,
        patternConfig: {
          ...polygon.missingData.patternConfig,
          background: '#abcdef'
        }
      }
    };
    expect(migrated.data.visualization.visualizations[0]).toEqual({
      id: 'viz-1',
      polygon: migratedPolygon,
      origin: {
        mode: 'custom',
        restoreState: { visualization: { polygon: migratedPolygon } }
      }
    });
    expect(motif).not.toHaveProperty('background');
  });

  it('should leave a motif background chosen before the migration untouched', () => {
    const pattern = { shape: 'circle', background: '#ff0000' };
    const data = {
      visualization: {
        visualizations: [{ polygon: { classification: { pattern } } }]
      }
    };

    const migrated = migrateIfNeeded({
      manifest: { version: '3.16.0', name: 'Colored motif' },
      data
    });

    expect(migrated.data).toEqual(data);
  });

  it('should reject a pre-production schema without silently restamping it', () => {
    expect(() =>
      migrateIfNeeded({
        manifest: { version: '3.8.0', name: 'Pre-production project' }
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION',
        details: expect.objectContaining({
          receivedVersion: '3.8.0',
          baselineVersion: PROJECT_CONST.SCHEMA_BASELINE_VERSION,
          currentVersion: PROJECT_CONST.SCHEMA_VERSION
        })
      })
    );
    expect(() =>
      assertCurrentProjectSchema({ manifest: { version: '3.8.0' } })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION'
      })
    );
  });

  it('should reject an unknown future schema', () => {
    expect(() =>
      migrateIfNeeded({
        manifest: { version: '99.0.0', name: 'Future project' }
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION',
        details: expect.objectContaining({ receivedVersion: '99.0.0' })
      })
    );
  });

  it('should reject a project without a schema version', () => {
    expect(() =>
      migrateIfNeeded({ manifest: { name: 'Unversioned project' } })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION',
        details: expect.objectContaining({ receivedVersion: 'unknown' })
      })
    );
  });
});
