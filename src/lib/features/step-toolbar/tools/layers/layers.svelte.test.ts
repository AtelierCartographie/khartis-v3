import { fireEvent, render, screen } from '@testing-library/svelte';
import * as m from '$lib/paraglide/messages';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'layers.svelte'),
  'utf8'
);

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

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    referenceBasemapId: null,
    requiresMapLibre: false
  }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  visualizationStore: mockVisualizationStore
}));

vi.mock('$lib/features/map/stores/basemap-layers.store.svelte', () => ({
  basemapLayersStore: {
    version: 0
  }
}));

vi.mock('$lib/features/map/stores/basemap-aux-layers.store.svelte', () => ({
  basemapAuxLayersStore: {
    version: 0
  }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    simplificationVersion: 0
  }
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    isActive: false
  }
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
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
    // Flattened model: each row is one primitive·viz or one global basemap row.
    mockLayersState.layers = [
      {
        id: 'viz-1::text',
        parentId: 'viz-1',
        isSubLayer: true,
        kind: 'viz-primitive',
        primitive: 'text',
        name: 'Textes · Population',
        visible: true,
        color: '#0e6027',
        type: 'visualization',
        order: 0
      },
      {
        id: 'viz-2::text',
        parentId: 'viz-2',
        isSubLayer: true,
        kind: 'viz-primitive',
        primitive: 'text',
        name: 'Textes · PIB',
        visible: true,
        color: '#0e6027',
        type: 'visualization',
        order: 1
      },
      {
        id: 'basemap::terre',
        isSubLayer: true,
        kind: 'basemap-aux',
        name: 'Terre',
        visible: true,
        color: '#8d8d8d',
        type: 'geographic',
        basemapLayerId: 'terre',
        order: 2
      }
    ];

    mockVisualizationStore.visualizations = [
      { id: 'viz-1', name: 'Population' },
      { id: 'viz-2', name: 'PIB' }
    ];

    vi.clearAllMocks();
  });

  it('resyncs when basemap metadata or auxiliary layer visibility changes', () => {
    expect(source).toContain('void basemapAuxLayersStore.version');
    expect(source).toContain('void basemapStyleStore.referenceBasemapId');
    expect(source).toContain('void basemapService.simplificationVersion');
  });

  it('renders every flattened row without collapsible parents', () => {
    render(Layers);

    expect(screen.getByText('Textes · Population')).toBeInTheDocument();
    expect(screen.getByText('Textes · PIB')).toBeInTheDocument();
    expect(screen.getByText('Terre')).toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: m.section_toggle() })
    ).not.toBeInTheDocument();
  });

  it('toggles a primitive row visibility via the eye button', async () => {
    render(Layers);

    const hideButtons = screen.getAllByRole('button', {
      name: m.layers_hide()
    });
    await fireEvent.click(hideButtons[0]);

    expect(mockLayersActions.toggleLayerVisibility).toHaveBeenCalledWith(
      'viz-1::text'
    );
  });

  it('toggles a basemap row visibility via the eye button', async () => {
    render(Layers);

    const hideButtons = screen.getAllByRole('button', {
      name: m.layers_hide()
    });
    await fireEvent.click(hideButtons[2]);

    expect(mockLayersActions.toggleLayerVisibility).toHaveBeenCalledWith(
      'basemap::terre'
    );
  });

  it('confirms rename and calls updateLayer with the visualization id and trimmed name', async () => {
    render(Layers);

    const menus = screen.getAllByRole('button', { name: 'menu' });
    await fireEvent.click(menus[0]);

    const renameButton = screen.getByRole('menuitem', {
      name: m.layers_rename()
    });
    await fireEvent.click(renameButton);

    const input = screen.getByLabelText(m.layers_rename_prompt());
    await fireEvent.input(input, { target: { value: '  Nouveau nom  ' } });

    const confirmButton = screen.getByRole('button', {
      name: m.layers_rename()
    });
    await fireEvent.click(confirmButton);

    expect(mockLayersActions.updateLayer).toHaveBeenCalledWith('viz-1', {
      name: 'Nouveau nom'
    });
  });

  it('cancels rename without calling updateLayer', async () => {
    render(Layers);

    const menus = screen.getAllByRole('button', { name: 'menu' });
    await fireEvent.click(menus[0]);

    const renameButton = screen.getByRole('menuitem', {
      name: m.layers_rename()
    });
    await fireEvent.click(renameButton);

    const cancelButtons = screen.getAllByRole('button', { name: m.cancel() });
    await fireEvent.click(cancelButtons[0]);

    expect(mockLayersActions.updateLayer).not.toHaveBeenCalled();
  });

  it('opens delete modal and confirms removal of the parent visualization', async () => {
    render(Layers);

    const menus = screen.getAllByRole('button', { name: 'menu' });
    await fireEvent.click(menus[0]);

    const deleteButton = screen.getByRole('menuitem', {
      name: m.layers_delete()
    });
    await fireEvent.click(deleteButton);

    const confirmButton = screen.getByRole('button', {
      name: m.layers_delete()
    });
    await fireEvent.click(confirmButton);

    expect(mockLayersActions.removeLayer).toHaveBeenCalledWith('viz-1');
  });

  it('calls duplicateLayer with the visualization id via the overflow menu', async () => {
    render(Layers);

    const menus = screen.getAllByRole('button', { name: 'menu' });
    await fireEvent.click(menus[0]);

    const duplicateButton = screen.getByRole('menuitem', {
      name: m.layers_duplicate()
    });
    await fireEvent.click(duplicateButton);

    expect(mockLayersActions.duplicateLayer).toHaveBeenCalledWith('viz-1');
  });

  it('calls reorderLayers with absolute indices when moving a row up via the overflow menu', async () => {
    render(Layers);

    const menus = screen.getAllByRole('button', { name: 'menu' });
    await fireEvent.click(menus[1]);

    const moveUpButton = screen.getByRole('menuitem', {
      name: m.layers_move_up()
    });
    await fireEvent.click(moveUpButton);

    expect(mockLayersActions.reorderLayers).toHaveBeenCalledWith(1, 0);
  });

  it('calls reorderLayers with absolute indices when moving a row down via the overflow menu', async () => {
    render(Layers);

    const menus = screen.getAllByRole('button', { name: 'menu' });
    await fireEvent.click(menus[0]);

    const moveDownButton = screen.getByRole('menuitem', {
      name: m.layers_move_down()
    });
    await fireEvent.click(moveDownButton);

    expect(mockLayersActions.reorderLayers).toHaveBeenCalledWith(0, 1);
  });
});
