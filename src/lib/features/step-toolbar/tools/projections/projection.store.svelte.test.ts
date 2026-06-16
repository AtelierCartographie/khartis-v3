import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection.store.svelte.ts'),
  'utf8'
);

describe('projection store', () => {
  it('clears the manual projection override when the active card is toggled', () => {
    expect(source).toContain('toggleSelected: (projectionId: string) => void;');
    expect(source).toContain('const clearSelectedInternal =');
    expect(source).toContain('s.overrideActive = false;');
    expect(source).toContain('s.overrideSource = undefined;');
    expect(source).toContain('s.activeSuggestionId = undefined;');
    expect(source).toContain('s.suggestionD3Config = undefined;');
    expect(source).toContain(
      'mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);'
    );
  });

  it('toggles the active suggestion and preserves d3 fallback config', () => {
    expect(source).not.toContain('activeSuggestionId: _activeSuggestionId');
    expect(source).toContain('const activeSuggestionId = suggestion.id;');
    expect(source).toContain(
      "overrideSource === 'manual' &&\n        s.overrideActive &&\n        s.activeSuggestionId === suggestion.id"
    );
    expect(source).toContain('function cloneD3UsageConfig(config: D3Usage)');
    expect(source).toContain(
      's.suggestionD3Config = cloneD3UsageConfig(suggestion.d3Config);'
    );
    expect(source).toContain('projection: config.projection');
  });

  it('computes projection suggestions without auto-selecting the first one', () => {
    expect(source).toContain('s.suggestions = result;');
    expect(source).toContain("if (s.overrideSource === 'auto')");
    expect(source).toContain('clearSelectedInternal(true);');
    expect(source).not.toContain("applyProjectionSuggestion(best, 'auto')");
  });

  it('turns projection settings into manual overrides without clearing the active projection', () => {
    expect(source).toContain('const activateManualProjectionOverride = () =>');
    expect(source).toContain("s.overrideSource = 'manual';");
    expect(source).toContain('simplifiedPreview: false');
    expect(source).toContain(
      'setCenter: (longitude: number, latitude: number) =>'
    );
    expect(source).toContain('setRotation: (rotation: number) =>');
    expect(source).toContain('activateManualProjectionOverride();');
  });

  it('captures the basemap simple projection when settings activate a manual override', () => {
    expect(source).toContain('if (!s.overrideActive) {');
    expect(source).toContain(
      "if (projTo?.type === 'simple' && projTo.proj4) {"
    );
    expect(source).toContain('s.customCode = projTo.proj4;');
  });

  it('reset settings restores the pre-override state for a captured basemap projection', () => {
    expect(source).toContain('resetSettings: () => {');
    expect(source).toContain(
      's.customCode === basemapService.currentMetadata?.proj_to?.proj4'
    );
    const resetIndex = source.indexOf('resetSettings: () => {');
    const resetBody = source.slice(
      resetIndex,
      source.indexOf('},', resetIndex)
    );
    expect(resetBody).toContain('s.center = undefined;');
    expect(resetBody).toContain('s.overrideActive = false;');
    expect(resetBody).toContain('s.overrideSource = undefined;');
  });

  it('persists projection choices and user settings while omitting only computed suggestions', () => {
    const serializeFilterIndex = source.indexOf('serializeFilter: ({');
    const serializeFilterEndIndex = source.indexOf(
      '}) => persisted',
      serializeFilterIndex
    );
    const serializeFilterSource = source.slice(
      serializeFilterIndex,
      serializeFilterEndIndex
    );

    expect(serializeFilterSource).toContain('suggestions: _suggestions');
    expect(serializeFilterSource).not.toContain('selected:');
    expect(serializeFilterSource).not.toContain('overrideActive:');
    expect(serializeFilterSource).not.toContain('overrideSource:');
    expect(serializeFilterSource).not.toContain('longitude:');
    expect(serializeFilterSource).not.toContain('latitude:');
    expect(serializeFilterSource).not.toContain('rotation:');
    expect(serializeFilterSource).not.toContain('center:');
    expect(serializeFilterSource).not.toContain('customCode:');
    expect(serializeFilterSource).not.toContain('activeSuggestionId:');
    expect(serializeFilterSource).not.toContain('suggestionD3Config:');
    expect(serializeFilterSource).not.toContain('simplifiedPreview:');
  });

  it('keeps custom CRS code active after catalogue metadata has been selected', () => {
    expect(source).toContain('setCustomCode: (code: string | null) =>');
    expect(source).toContain('s.customCode = code?.trim() || undefined;');
    expect(source).toContain(
      'mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);'
    );
  });

  it('selects the catalogue composite projection id from basemap metadata presets', () => {
    expect(source).toContain('getCompositeProjectionSelectionId');
    expect(source).toContain("projectionMetadata.type === 'composite'");
    expect(source).toContain('setSelectedInternal(projectionId, true,');
  });
});
