import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'join-assisted-section.svelte'),
  'utf8'
);

describe('JoinAssistedSection — selected-basemap tooltip (S1.1c.iii)', () => {
  it('defines buildRowTooltip with selectedBasemapValue and fallback inputs', () => {
    expect(source).toContain('function buildRowTooltip(');
    expect(source).toContain('selectedBasemapValue: string | undefined');
    expect(source).toContain(
      'extraIdentifiers: string[] | undefined = undefined'
    );
  });

  it('disables the tooltip when no basemap value is selected', () => {
    expect(source).toContain("return { tags: [], text: '', disabled: true };");
  });

  it('feeds the basemap aliases of the selected value as tags', () => {
    expect(source).toContain('basemapAliasesByValue?.[selectedBasemapValue];');
    expect(source).toContain('const tags: string[] = [];');
  });

  it('builds the joined-row tooltip from the selected basemap value', () => {
    expect(source).toContain('{@const joinedTooltip = buildRowTooltip(');
    expect(source).toContain('row.basemapValue');
  });

  it('builds the verify-row tooltip from the selected mapping', () => {
    expect(source).toContain('{@const verifyTooltip = buildRowTooltip(');
    expect(source).toContain('row.selectedMapping');
  });

  it('builds the unrecognized-row tooltip from the pending selection', () => {
    expect(source).toContain('{@const unrecognizedTooltip = buildRowTooltip(');
    expect(source).toContain('pendingUnrecognizedSelections.get(entity)');
  });

  it('passes tags and disabled props to InfoPopover for each category', () => {
    expect(source).toContain('tags={joinedTooltip.tags}');
    expect(source).toContain('disabled={joinedTooltip.disabled}');
    expect(source).toContain('tags={verifyTooltip.tags}');
    expect(source).toContain('disabled={verifyTooltip.disabled}');
    expect(source).toContain('tags={unrecognizedTooltip.tags}');
    expect(source).toContain('disabled={unrecognizedTooltip.disabled}');
  });

  it('marks the validated action as a disabled button with validated aria-label', () => {
    expect(source).toContain('aria-label={m.join_action_validated()}');
    expect(source).toContain(
      'class="row-action row-action-validate row-action-disabled"'
    );
    expect(source).toContain('disabled');
  });

  it('uses aria-label for ignore and validate actions', () => {
    expect(source).toContain('aria-label={m.join_action_ignore()}');
    expect(source).toContain('aria-label={m.join_action_validate()}');
  });
});
