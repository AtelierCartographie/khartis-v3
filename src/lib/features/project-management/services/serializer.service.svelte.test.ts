import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'serializer.service.ts'),
  'utf8'
);

function getDeserializeProjectDataSource(): string {
  const start = source.indexOf('export async function deserializeProjectData(');
  const end = source.indexOf(
    'export async function prepareForIndexedDB(',
    start
  );

  return source.slice(start, end);
}

describe('serializer restore contract', () => {
  it('does not mark persistence clean during deserializeProjectData', () => {
    expect(getDeserializeProjectDataSource()).not.toContain(
      'persistenceRegistry.markClean()'
    );
  });

  it('restores registry-backed stores with persistence notifications suspended', () => {
    const deserializeProjectDataSource = getDeserializeProjectDataSource();

    expect(deserializeProjectDataSource).toContain(
      'await persistenceRegistry.withPersistenceSuspended(() => {'
    );
    expect(deserializeProjectDataSource).toContain(
      'persistenceRegistry.resetAll();'
    );
    expect(deserializeProjectDataSource).toContain(
      'persistenceRegistry.deserializeAll(storeData);'
    );
  });

  it('uses structured logging instead of console.error in the persistence core', () => {
    expect(source).not.toContain('console.error(');
  });

  it('persists and restores projection layout settings through project data', () => {
    expect(source).toContain('projection: stores.projection');
    expect(source).toContain(
      'if (ls.projection) stores.projection = ls.projection;'
    );
  });
});
