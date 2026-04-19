import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import LayersList from './layers-list.svelte';
import type { Layer } from './layers.types';

vi.mock('svelte-dnd-action', () => ({
  dragHandle: () => ({ destroy() {} }),
  dragHandleZone: () => ({ destroy() {} })
}));

const parentLayer: Layer = {
  id: 'viz-1',
  name: 'Visualisation',
  visible: true,
  color: '#ff0000',
  type: 'visualization',
  order: 0
};

const vizSubLayer: Layer = {
  id: 'viz-1::point',
  name: 'Symboles',
  visible: true,
  color: '#ff0000',
  type: 'visualization',
  order: 0,
  parentId: 'viz-1',
  isSubLayer: true
};

const vizSubLayerTwo: Layer = {
  id: 'viz-1::polygon',
  name: 'Polygones',
  visible: true,
  color: '#00aa00',
  type: 'visualization',
  order: 1,
  parentId: 'viz-1',
  isSubLayer: true
};

const basemapSubLayer: Layer = {
  id: 'viz-1::basemap::terre',
  name: 'Terre',
  visible: true,
  color: '#8a3800',
  type: 'geographic',
  order: 2,
  parentId: 'viz-1',
  isSubLayer: true,
  basemapLayerId: 'terre'
};

describe('layers list', () => {
  it('should display sublayers including basemap sublayers', () => {
    render(LayersList, {
      parentLayers: [parentLayer],
      childLayersByParent: {
        'viz-1': [vizSubLayer, vizSubLayerTwo, basemapSubLayer]
      },
      onToggleVisibility: vi.fn(),
      onOpenSettings: vi.fn(),
      onReorderLayers: vi.fn(),
      onReorderSubLayers: vi.fn(),
      reorderScope: 'visualization'
    });

    expect(screen.getByText('Symboles')).toBeInTheDocument();
    expect(screen.getByText('Polygones')).toBeInTheDocument();
    expect(screen.getByText('Terre')).toBeInTheDocument();
  });

  it('should wire visibility toggle and settings callbacks', async () => {
    const onToggleVisibility = vi.fn();
    const onOpenSettings = vi.fn();

    render(LayersList, {
      parentLayers: [parentLayer],
      childLayersByParent: {
        'viz-1': [vizSubLayer]
      },
      onToggleVisibility,
      onOpenSettings,
      onReorderLayers: vi.fn(),
      onReorderSubLayers: vi.fn(),
      reorderScope: 'visualization'
    });

    const hideButtons = screen.getAllByRole('button', {
      name: m.layers_hide()
    });
    await fireEvent.click(hideButtons[0]);
    expect(onToggleVisibility).toHaveBeenCalledWith('viz-1');

    const settingsButtons = screen.getAllByRole('button', {
      name: m.layers_settings()
    });
    await fireEvent.click(settingsButtons[0]);
    expect(onOpenSettings).toHaveBeenCalledWith('viz-1::point');
  });

  it('should not display arrow up/down buttons on sublayers', () => {
    render(LayersList, {
      parentLayers: [parentLayer],
      childLayersByParent: {
        'viz-1': [vizSubLayer, vizSubLayerTwo]
      },
      onToggleVisibility: vi.fn(),
      onOpenSettings: vi.fn(),
      onReorderLayers: vi.fn(),
      onReorderSubLayers: vi.fn(),
      reorderScope: 'visualization'
    });

    expect(
      screen.queryByRole('button', { name: m.layers_move_up() })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.layers_move_down() })
    ).not.toBeInTheDocument();
  });
});
