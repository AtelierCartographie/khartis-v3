import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import LayersList from './layers-list.svelte';
import type { Layer } from '../../types/layers.types';

vi.mock('svelte-dnd-action', () => ({
  dragHandle: () => ({ destroy() {} }),
  dragHandleZone: () => ({ destroy() {} })
}));

const vizPrimitive: Layer = {
  id: 'viz-1::point',
  name: 'Symboles · Visualisation',
  visible: true,
  color: '#ff0000',
  type: 'visualization',
  kind: 'viz-primitive',
  order: 0,
  parentId: 'viz-1',
  isSubLayer: true
};

const vizPrimitiveTwo: Layer = {
  id: 'viz-1::polygon',
  name: 'Polygones · Visualisation',
  visible: true,
  color: '#00aa00',
  type: 'visualization',
  kind: 'viz-primitive',
  order: 1,
  parentId: 'viz-1',
  isSubLayer: true
};

const basemapLayer: Layer = {
  id: 'basemap::terre',
  name: 'Terre',
  visible: true,
  color: '#8a3800',
  type: 'geographic',
  kind: 'basemap-aux',
  order: 2,
  isSubLayer: true,
  basemapLayerId: 'terre'
};

describe('layers list', () => {
  it('renders the whole flattened list including basemap rows', () => {
    render(LayersList, {
      layers: [vizPrimitive, vizPrimitiveTwo, basemapLayer],
      onToggleVisibility: vi.fn(),
      onOpenSettings: vi.fn(),
      onReorder: vi.fn()
    });

    expect(screen.getByText('Symboles · Visualisation')).toBeInTheDocument();
    expect(screen.getByText('Polygones · Visualisation')).toBeInTheDocument();
    expect(screen.getByText('Terre')).toBeInTheDocument();
  });

  it('wires visibility toggle and settings callbacks per row', async () => {
    const onToggleVisibility = vi.fn();
    const onOpenSettings = vi.fn();

    render(LayersList, {
      layers: [vizPrimitive],
      onToggleVisibility,
      onOpenSettings,
      onReorder: vi.fn()
    });

    const hideButtons = screen.getAllByRole('button', {
      name: m.layers_hide()
    });
    await fireEvent.click(hideButtons[0]);
    expect(onToggleVisibility).toHaveBeenCalledWith('viz-1::point');

    const settingsButtons = screen.getAllByRole('button', {
      name: m.layers_settings()
    });
    await fireEvent.click(settingsButtons[0]);
    expect(onOpenSettings).toHaveBeenCalledWith('viz-1::point');
  });

  it('exposes the row context menu only for primitive·viz rows', () => {
    render(LayersList, {
      layers: [vizPrimitive, basemapLayer],
      onToggleVisibility: vi.fn(),
      onOpenSettings: vi.fn(),
      onReorder: vi.fn()
    });

    // One overflow menu (the primitive row), none for the basemap row.
    const menus = screen.getAllByRole('button', { name: 'menu' });
    expect(menus).toHaveLength(1);
  });

  it('targets the parent visualization id from the row context menu actions', async () => {
    const onDeleteLayer = vi.fn();
    render(LayersList, {
      layers: [vizPrimitive],
      onToggleVisibility: vi.fn(),
      onOpenSettings: vi.fn(),
      onReorder: vi.fn(),
      onDeleteLayer
    });

    const menus = screen.getAllByRole('button', { name: 'menu' });
    await fireEvent.click(menus[0]);
    const deleteItem = screen.getByRole('menuitem', {
      name: m.layers_delete()
    });
    await fireEvent.click(deleteItem);

    expect(onDeleteLayer).toHaveBeenCalledWith('viz-1');
  });
});
