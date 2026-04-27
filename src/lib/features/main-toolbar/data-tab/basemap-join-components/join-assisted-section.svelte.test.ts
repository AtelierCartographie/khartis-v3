import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'join-assisted-section.svelte'),
  'utf8'
);

describe('JoinAssistedSection — otherIdentifiers tooltip (S1.1c.iii)', () => {
  it('defines formatOtherIdentifiers that returns undefined title when otherIdentifiers is empty', () => {
    expect(source).toContain('function formatOtherIdentifiers(');
    expect(source).toContain(
      'if (!otherIdentifiers || otherIdentifiers.length === 0) {'
    );
    expect(source).toContain("return { title: undefined, label: '' }");
  });

  it('defines formatOtherIdentifiers that builds a title from join_other_identifiers_tooltip when otherIdentifiers is present', () => {
    expect(source).toContain("const ids = otherIdentifiers.join(', ');");
    expect(source).toContain(
      'title: m.join_other_identifiers_tooltip({ ids })'
    );
  });

  it('computes otherIds from row.otherIdentifiers for each joined entity row', () => {
    expect(source).toContain('{@const otherIds = formatOtherIdentifiers(');
    expect(source).toContain('row.otherIdentifiers');
  });

  it('binds the info button title to otherIds.title', () => {
    expect(source).toContain(
      'title={otherIds.title ??\n                            m.join_no_other_identifiers_tooltip()}'
    );
  });

  it('disables the info button when there are no other identifiers', () => {
    expect(source).toContain('class:row-action-disabled={!otherIds.title}');
  });

  it('uses aria-label for the info button regardless of disabled state', () => {
    expect(source).toContain('aria-label={m.join_action_info()}');
  });
});
