import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  FACET_SLOT,
  SCALE_MODE,
  type FacetSlotPath
} from '$lib/features/commons/constants/facets.constants';
import type { LegendItem } from '../../types/legend.types';

const facetsState = {
  enabled: false,
  scaleMode:
    SCALE_MODE.INDEPENDENT as (typeof SCALE_MODE)[keyof typeof SCALE_MODE],
  generatedVisualizationIds: [] as string[],
  fillSlotPath: null as FacetSlotPath | null,
  mapFillVariables: [] as string[]
};

vi.mock('../facets', () => ({
  SCALE_MODE,
  facetsStore: {
    get enabled() {
      return facetsState.enabled;
    },
    get scaleMode() {
      return facetsState.scaleMode;
    },
    get generatedVisualizationIds() {
      return facetsState.generatedVisualizationIds;
    },
    get fillSlotPath() {
      return facetsState.fillSlotPath;
    },
    get mapFillVariables() {
      return facetsState.mapFillVariables;
    }
  }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  visualizationStore: { visualizations: [] }
}));

const { selectRenderedLegendItems } = await import('./legend-items.utils');

function makeItem(
  id: string,
  variableId?: string,
  component?: LegendItem['component']
): LegendItem {
  return {
    ...(component ? { component } : {}),
    id,
    name: id,
    visible: true,
    title: id,
    titleMode: 'auto',
    subtitle: '',
    subtitleMode: 'auto',
    note: '',
    variableId
  };
}

describe('selectRenderedLegendItems', () => {
  beforeEach(() => {
    facetsState.enabled = false;
    facetsState.scaleMode = SCALE_MODE.INDEPENDENT;
    facetsState.generatedVisualizationIds = [];
    facetsState.fillSlotPath = null;
    facetsState.mapFillVariables = [];
  });

  it('returns every item when no collection is active', () => {
    const items = [makeItem('viz-1', 'viz-1'), makeItem('custom')];
    expect(selectRenderedLegendItems(items)).toEqual(items);
  });

  it('drops the base visualization legend in a collection (no phantom entry)', () => {
    facetsState.enabled = true;
    facetsState.generatedVisualizationIds = ['facet-a', 'facet-b'];

    const items = [
      makeItem('base', 'base'),
      makeItem('facet-a', 'facet-a'),
      makeItem('facet-b', 'facet-b')
    ];

    const result = selectRenderedLegendItems(items);
    expect(result.map((item) => item.variableId)).toEqual([
      'facet-a',
      'facet-b'
    ]);
  });

  it('keeps a single legend for a shared scale', () => {
    facetsState.enabled = true;
    facetsState.scaleMode = SCALE_MODE.SHARED;
    facetsState.generatedVisualizationIds = ['facet-a', 'facet-b'];

    const items = [
      makeItem('facet-a', 'facet-a'),
      makeItem('facet-b', 'facet-b')
    ];

    expect(selectRenderedLegendItems(items)).toHaveLength(1);
  });

  it('keeps each channel once on a shared scale, and every map fill when its categories differ', () => {
    facetsState.enabled = true;
    facetsState.scaleMode = SCALE_MODE.SHARED;
    facetsState.generatedVisualizationIds = ['facet-a', 'facet-b'];
    const items = [
      makeItem('a-size', 'facet-a', 'size'),
      makeItem('a-color', 'facet-a', 'color'),
      makeItem('b-size', 'facet-b', 'size'),
      makeItem('b-color', 'facet-b', 'color')
    ];

    expect(selectRenderedLegendItems(items).map((item) => item.id)).toEqual([
      'a-size',
      'a-color'
    ]);

    facetsState.fillSlotPath = FACET_SLOT.SYMBOL_FILL_CATEGORY;
    facetsState.mapFillVariables = ['zone', 'region'];

    expect(selectRenderedLegendItems(items).map((item) => item.id)).toEqual([
      'a-size',
      'a-color',
      'b-color'
    ]);
  });

  it('scopes to a single facet when a scopeVizId is given', () => {
    facetsState.enabled = true;
    facetsState.generatedVisualizationIds = ['facet-a', 'facet-b'];

    const items = [
      makeItem('facet-a', 'facet-a'),
      makeItem('facet-b', 'facet-b')
    ];

    const result = selectRenderedLegendItems(items, { scopeVizId: 'facet-b' });
    expect(result.map((item) => item.variableId)).toEqual(['facet-b']);
  });
});
