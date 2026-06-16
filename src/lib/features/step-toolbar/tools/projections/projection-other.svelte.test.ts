import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-other.svelte'),
  'utf8'
);
const suggestionCatalogueSource = readFileSync(
  resolve(import.meta.dirname, 'projection-suggestion-catalogue.utils.ts'),
  'utf8'
);

describe('ProjectionOther', () => {
  it('renders the catalogue as a searchable ComboBox bound to the active selection', () => {
    expect(source).toContain('ComboBox');
    expect(source).toContain('items={catalogueComboItems}');
    expect(source).toContain('selectedId={activeCatalogueSelectionId}');
    expect(source).toContain('on:select={handleCatalogueSelect}');
    expect(source).not.toContain(
      "import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';"
    );
  });

  it('keeps the catalogue in a single searchable list without display mode controls', () => {
    expect(source).toContain('{#key catalogueItemsSignature}');
    expect(source).toContain('className="projection-view-tabs"');
    expect(source).not.toContain(
      "import { ViewMode } from '$lib/features/commons/constants/ui.constants';"
    );
    expect(source).not.toContain('GridIcon');
    expect(source).not.toContain('projection-display-tabs');
    expect(source).not.toContain('projection-content--grid');
    expect(source).not.toContain('handleDisplayModeChange');
  });

  it('keeps catalogue selection derived from the active catalogue projection', () => {
    expect(source).toContain(
      'const projectionState = $derived(getProjectionState());'
    );
    expect(source).toContain('const activeCatalogueSelectionId = $derived.by');
    expect(source).toContain('item.projectionId === projectionState.selected');
  });

  it('filters catalogue cards already present in Khartis suggestions', () => {
    expect(source).toContain('const suggestionProjectionIds = $derived.by');
    expect(source).toContain(
      "import { getCatalogueProjectionIdForSuggestion } from './projection-suggestion-catalogue.utils';"
    );
    expect(source).toContain(
      '!suggestionProjectionIds.has(projection.projectionId)'
    );
    expect(suggestionCatalogueSource).toContain("['peters', 'gall-peters']");
    expect(suggestionCatalogueSource).toContain(
      "['equalearth', 'equal-earth']"
    );
    expect(suggestionCatalogueSource).toContain(
      "['laea', 'azimuthal-equal-area']"
    );
  });

  it('does not present suggestion or code projections as catalogue selections', () => {
    expect(source).toContain('function isCatalogueProjectionActive(): boolean');
    expect(source).toContain("projectionState.overrideSource === 'manual'");
    expect(source).toContain('!projectionState.customCode');
    expect(source).toContain('!projectionState.activeSuggestionId');
    expect(source).toContain('!projectionState.suggestionD3Config');
    expect(source).toContain(
      'projectionActions.setSelected(item.projectionId);'
    );
  });

  it('keeps the CRS textarea synchronized with the active custom code', () => {
    expect(source).toContain('let crsCodeDraft = $state');
    expect(source).toContain(
      "const crsCode = $derived(crsCodeDraft ?? projectionState.customCode ?? '');"
    );
    expect(source).toContain('value={crsCode}');
    expect(source).toContain('on:input={handleCrsCodeInput}');
  });

  it('shows a clear unavailable state when the active catalogue item is filtered out', () => {
    expect(source).toContain('const selectedCatalogueUnavailable = $derived(');
    expect(source).toContain('m.projection_catalog_unavailable_title()');
    expect(source).toContain('m.projection_catalog_unavailable_subtitle()');
  });
});
