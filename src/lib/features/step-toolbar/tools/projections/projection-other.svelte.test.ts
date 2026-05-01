import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-other.svelte'),
  'utf8'
);

describe('ProjectionOther', () => {
  it('renders the catalogue as neutral projection cards instead of a ComboBox', () => {
    expect(source).toContain(
      "import ProjectionCard from '$lib/features/commons/components/projection-card.svelte';"
    );
    expect(source).toContain('variant="gray"');
    expect(source).toContain('selected={isCatalogueItemSelected(item)}');
    expect(source).not.toContain('ComboBox');
    expect(source).not.toContain('selectedId={activeCatalogueSelectionId}');
  });

  it('shares the suggestion list and grid presentation controls', () => {
    expect(source).toContain(
      "import { ViewMode } from '$lib/features/commons/constants/ui.constants';"
    );
    expect(source).toContain(
      'class:projection-content--grid={viewMode === ViewMode.GRID}'
    );
    expect(source).toContain('setViewMode(ViewMode.LIST)');
    expect(source).toContain('setViewMode(ViewMode.GRID)');
    expect(source).toContain('grid-template-columns: repeat(3, 184px);');
    expect(source).toContain('width: 184px;');
    expect(source).toContain('height: 176px;');
    expect(source).toContain('showTag={false}');
  });

  it('keeps catalogue selection derived from the active catalogue projection', () => {
    expect(source).toContain(
      'const projectionState = $derived(getProjectionState());'
    );
    expect(source).toContain('const activeCatalogueSelectionId = $derived.by');
    expect(source).toContain('projectionState.selected === item.projectionId');
  });

  it('filters catalogue cards already present in Khartis suggestions', () => {
    expect(source).toContain('const suggestionProjectionIds = $derived.by');
    expect(source).toContain('function getCatalogueProjectionIdForSuggestion');
    expect(source).toContain(
      '!suggestionProjectionIds.has(projection.projectionId)'
    );
    expect(source).toContain("['peters', 'gall-peters']");
    expect(source).toContain("['equalearth', 'equal-earth']");
    expect(source).toContain("['laea', 'azimuthal-equal-area']");
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

  it('shows a clear unavailable state when the active catalogue item is filtered out', () => {
    expect(source).toContain('const selectedCatalogueUnavailable = $derived(');
    expect(source).toContain('m.projection_catalog_unavailable_title()');
    expect(source).toContain('m.projection_catalog_unavailable_subtitle()');
  });
});
