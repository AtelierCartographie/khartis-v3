import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'enrichment-join-config.svelte'),
  'utf8'
);

describe('EnrichmentJoinConfig — assisted join UI', () => {
  it('uses the current JoinAssistedSection instead of the legacy JoinAccordion', () => {
    expect(source).toContain('JoinAssistedSection');
    expect(source).not.toContain('JoinAccordion');
  });

  it('adapts enrichment join stats to the five assisted-join categories', () => {
    expect(source).toContain('joinedEntitiesList');
    expect(source).toContain('toVerifyRows');
    expect(source).toContain('duplicateEntities');
    expect(source).toContain('unrecognizedEntities');
    expect(source).toContain('ignoredEntities');
  });

  it('passes target options and row actions to the shared assisted join component', () => {
    expect(source).toContain('basemapValues={targetOptions}');
    expect(source).toContain('onMappingChange={onMappingChange}');
    expect(source).toContain('onManualCorrection={onManualCorrection}');
    expect(source).toContain('onValidateEntity={onValidateEntity}');
    expect(source).toContain('onIgnoreEntity={onIgnoreEntity}');
  });
});
