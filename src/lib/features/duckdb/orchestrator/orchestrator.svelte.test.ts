import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'orchestrator.svelte.ts'),
  'utf8'
);

describe('duckDB orchestrator source', () => {
  it('emits a single dataset version bump when finalizing joins', () => {
    const body = source.match(
      /async finalizeJoin[\s\S]*?async getGPSBounds/
    )?.[0];

    expect(body).toBeDefined();
    expect(body).toContain('bumpVersion: false');
    expect(body?.match(/state\.bumpDatasetsVersion\(\)/g)).toHaveLength(1);
  });

  it('serializes and supersedes concurrent join finalization per dataset', () => {
    const body = source.match(
      /async finalizeJoin[\s\S]*?async getGPSBounds/
    )?.[0];

    expect(source).toContain('const joinQueues = new Map');
    expect(source).toContain('function nextJoinRequestId');
    expect(source).toContain('function isCurrentJoinRequest');
    expect(source).toContain('function resetJoinRequestState');
    expect(body).toContain('const previous = joinQueues.get(targetDatasetId)');
    expect(body).toContain('!isCurrentJoinRequest(');
    expect(body).toContain('joinQueues.delete(targetDatasetId)');
  });

  it('does not query geometry extents on tabular tables without a geometry column', () => {
    const body = source.match(
      /async getGeometryExtent[\s\S]*?async getTableData/
    )?.[0];

    expect(body).toContain('Duck.describe_table(dataset.tableName)');
    expect(body).toContain('isGeometryColumnType(tableInfo.type[index])');
    expect(body).toContain('if (!geometryColumn)');
    expect(body).toContain('WHERE "${escapedGeometryColumn}" IS NOT NULL');
    expect(body).not.toContain('WHERE geom IS NOT NULL');
  });
});
