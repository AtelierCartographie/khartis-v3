import { fireEvent, render, screen } from '@testing-library/svelte';
import * as m from '$lib/paraglide/messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('svelte-dnd-action', () => ({
  dragHandle: () => ({ destroy() {} }),
  dragHandleZone: () => ({ destroy() {} })
}));

const { mockLayersState, mockLayersActions, mockVisualizationStore } =
  vi.hoisted(() => ({
    mockLayersState: {
      layers: [] as Array<Record<string, unknown>>
    },
    mockLayersActions: {
      updateLayer: vi.fn(),
      removeLayer: vi.fn(),
      toggleLayerVisibility: vi.fn(),
      reorderLayers: vi.fn(),
      reorderSubLayers: vi.fn(),
      duplicateLayer: vi.fn(),
      syncWithVisualizations: vi.fn()
    },
    mockVisualizationStore: {
      version: 0,
      visualizations: [] as Array<{ id: string; name: string }>,
      selectVisualization: vi.fn()
    }
  }));

vi.mock('./layers.store.svelte', () => ({
  layersActions: mockLayersActions,
  layersState: mockLayersState
}));

vi.mock('$lib/features/commons/store/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    requiresMapLibre: false
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: mockVisualizationStore
}));

vi.mock('$lib/features/map/stores/basemap-layers.store.svelte', () => ({
  basemapLayersStore: {
    version: 0
  }
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    isActive: false
  }
}));

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalActions: {
    setNavigationState: vi.fn()
  },
  globalState: {
    selectedTool: undefined
  }
}));

vi.mock('$lib/features/step-toolbar/tools/facets/facets.store.svelte', () => ({
  facetsStore: {
    enabled: false
  }
}));

import Layers from './layers.svelte';

describe('layers', () => {
  beforeEach(() => {
    mockLayersState.layers = [
      {
        id: 'viz-1',
        name: 'Visualisation (1)',
        visible: true,
        color: '#0e6027',
        type: 'visualization',
        order: 0
      },
      {
        id: 'viz-1::text',
        parentId: 'viz-1',
        isSubLayer: true,
        name: 'Textes population',
        visible: true,
        color: '#0e6027',
        type: 'visualization',
        order: 0
      },
      {
        id: 'viz-2',
        name: 'Visualisation (2)',
        visible: true,
        color: '#0e6027',
        type: 'visualization',
        order: 1
      },
      {
        id: 'viz-2::text',
        parentId: 'viz-2',
        isSubLayer: true,
        name: 'Textes PIB',
        visible: true,
        color: '#0e6027',
        type: 'visualization',
        order: 0
      }
    ];

    mockVisualizationStore.visualizations = [
      { id: 'viz-1', name: 'Population' },
      { id: 'viz-2', name: 'PIB' }
    ];

    vi.clearAllMocks();
  });

  it('collapses parent groups from the main layer cards', async () => {
    render(Layers);

    expect(screen.getByText('Visualisation (1)')).toBeInTheDocument();
    expect(screen.getByText('Visualisation (2)')).toBeInTheDocument();
    expect(screen.getByText('Textes population')).toBeInTheDocument();
    expect(screen.queryByText('Textes PIB')).not.toBeInTheDocument();

    const toggles = screen.getAllByRole('button', { name: m.section_toggle() });
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(toggles[1]);

    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Textes PIB')).toBeInTheDocument();
  });
});
