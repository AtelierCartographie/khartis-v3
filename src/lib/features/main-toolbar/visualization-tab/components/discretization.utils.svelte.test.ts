import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'discretization.utils.ts'),
  'utf8'
);

describe('resolveDiscretizationLabel', () => {
  it('defaults the compact summary to Jenks and 5 classes', () => {
    expect(source).toContain(
      'const method = classification?.method ?? CM.JENKS;'
    );
    expect(source).toContain(
      'const numClasses = classification?.numClasses ?? classification?.classes ?? 5;'
    );
  });

  it('formats the compact summary as "<method>, <count> classes"', () => {
    expect(source).toContain('return `${methodLabel}, ${numClasses} classes`;');
    expect(source).not.toContain(
      'm.discretization_num_classes().toLowerCase()'
    );
  });
});
