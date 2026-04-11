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

const childLayer: Layer = {
  id: 'viz-1-symbols',
  name: 'Symboles',
  visible: true,
  color: '#ff0000',
  type: 'visualization',
  order: 0,
  parentId: 'viz-1',
  isSubLayer: true
};

const childLayerTwo: Layer = {
  id: 'viz-1-polygons',
  name: 'Polygones',
  visible: true,
  color: '#00aa00',
  type: 'visualization',
  order: 1,
  parentId: 'viz-1',
  isSubLayer: true
};

describe('layers list', () => {
  it('collapses children and wires layer callbacks', async () => {
    const onToggleVisibility = vi.fn();
    const onOpenSettings = vi.fn();
    const onMoveLayer = vi.fn();
    const onMoveSubLayer = vi.fn();

    render(LayersList, {
      parentLayers: [parentLayer],
      childLayersByParent: {
        'viz-1': [childLayer, childLayerTwo]
      },
      onToggleVisibility,
      onOpenSettings,
      onReorderLayers: vi.fn(),
      onReorderSubLayers: vi.fn(),
      onMoveLayer,
      onMoveSubLayer,
      reorderScope: 'visualization'
    });

    expect(screen.getByText('Symboles')).toBeInTheDocument();
    expect(screen.getByText('Polygones')).toBeInTheDocument();

    const hideButtons = screen.getAllByRole('button', {
      name: m.layers_hide()
    });

    await fireEvent.click(hideButtons[0]);
    expect(onToggleVisibility).toHaveBeenCalledWith('viz-1');

    const settingsButtons = screen.getAllByRole('button', {
      name: m.layers_settings()
    });
    await fireEvent.click(settingsButtons[0]);
    expect(onOpenSettings).toHaveBeenCalledWith('viz-1-symbols');

    const moveDownButtons = screen.getAllByRole('button', {
      name: m.layers_move_down()
    });
    await fireEvent.click(moveDownButtons[1]);
    expect(onMoveSubLayer).toHaveBeenCalledWith('viz-1', 'viz-1-symbols', 1);

    await fireEvent.click(
      screen.getByRole('button', { name: m.layers_collapse() })
    );

    expect(screen.queryByText('Symboles')).not.toBeInTheDocument();
  });
});
