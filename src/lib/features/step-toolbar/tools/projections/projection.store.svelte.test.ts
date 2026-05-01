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
    expect(source).toContain('activeSuggestionId: _activeSuggestionId');
    expect(source).toContain('const activeSuggestionId = suggestion.id;');
    expect(source).toContain(
      "overrideSource === 'manual' &&\n        s.overrideActive &&\n        s.activeSuggestionId === suggestion.id"
    );
    expect(source).toContain('function cloneD3UsageConfig(config: D3Usage)');
    expect(source).toContain(
      's.suggestionD3Config = cloneD3UsageConfig(suggestion.d3Config);'
    );
    expect(source).toContain('d3Projection: suggestion.d3Config.projection');
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
    expect(source).toContain(
      'setCenter: (longitude: number, latitude: number) =>'
    );
    expect(source).toContain('setRotation: (rotation: number) =>');
    expect(source).toContain('activateManualProjectionOverride();');
  });

  it('keeps custom CRS code active after catalogue metadata has been selected', () => {
    expect(source).toContain('setCustomCode: (code: string | null) =>');
    expect(source).toContain('s.customCode = code?.trim() || undefined;');
    expect(source).toContain(
      'mapProjectionStore.setProjection(MERCATOR_PROJECTION_TYPE);'
    );
  });
});
