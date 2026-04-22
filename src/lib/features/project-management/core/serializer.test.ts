import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'serializer.ts'),
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

  it('uses structured logging instead of console.error in the persistence core', () => {
    expect(source).not.toContain('console.error(');
  });
});
