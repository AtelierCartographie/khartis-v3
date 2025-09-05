import {
  toolActions,
  toolState
} from '../tools-store/tools-store.store.svelte';
import type { LegendItem, LegendState } from './legend.types';

export function getLegendState(): LegendState {
  return toolState.legend;
}

export const legendActions = {
  setState(newState: Partial<LegendState>): void {
    toolActions.updateLegend(newState);
  },

  addLegendItem(item: Omit<LegendItem, 'id'>): LegendItem {
    const newItem: LegendItem = {
      ...item,
      id: `legend-${Date.now()}`
    };

    const currentState = getLegendState();
    const updatedItems = [...currentState.items, newItem];
    toolActions.updateLegend({ items: updatedItems });

    console.log(
      '[Legend] ➕ Added legend item:',
      newItem.title || newItem.name
    );
    return newItem;
  },

  removeLegendItem(id: string): void {
    const currentState = getLegendState();
    const item = currentState.items.find((item) => item.id === id);
    const updatedItems = currentState.items.filter((item) => item.id !== id);
    toolActions.updateLegend({ items: updatedItems });

    console.log('[Legend] 🗑️ Removed legend item:', item?.title || id);
  },

  updateLegendItem(id: string, updates: Partial<LegendItem>): void {
    const currentState = getLegendState();
    const updatedItems = currentState.items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    toolActions.updateLegend({ items: updatedItems });

    console.log('[Legend] ✏️ Updated legend item:', id);
  },

  toggleLegendVisibility(): void {
    const currentState = getLegendState();
    toolActions.updateLegend({ visible: !currentState.visible });
    console.log(
      '[Legend] 👁️ Legend',
      !currentState.visible ? 'visible' : 'hidden'
    );
  },

  setPosition(
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  ): void {
    toolActions.updateLegend({ position });
    console.log('[Legend] 📍 Position changed to:', position);
  },

  setActiveTab(tab: 'content' | 'style'): void {
    toolActions.updateLegend({ activeTab: tab });
    console.log('[Legend] 📋 Active tab:', tab);
  },

  reset(): void {
    console.log('[Legend] 🔄 Reset to default state');
    toolActions.resetTool('legend');
  }
};
