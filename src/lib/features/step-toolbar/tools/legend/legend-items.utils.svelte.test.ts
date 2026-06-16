import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SCALE_MODE } from '$lib/features/commons/constants/facets.constants';
import type { LegendItem } from '../../types/legend.types';

const facetsState = {
  enabled: false,
  scaleMode:
    SCALE_MODE.INDEPENDENT as (typeof SCALE_MODE)[keyof typeof SCALE_MODE],
  generatedVisualizationIds: [] as string[]
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
    }
  }
}));

const { selectRenderedLegendItems } = await import('./legend-items.utils');

function makeItem(id: string, variableId?: string): LegendItem {
  return {
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
