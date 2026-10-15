import type { Layer, PickingInfo } from '@deck.gl/core';

import {
  createHoverHighlightOverlay,
  resolveHoveredFeature
} from '../layers/hover-highlight-overlay';

// Kept apart from the search highlight: hovering must neither clear a search
// selection nor rebuild the thematic layers.
function createMapHoverHighlightStore() {
  let overlay = $state.raw<Layer | null>(null);
  let sourceLayerId: string | null = null;
  let hoveredKey: string | null = null;

  function setFromPick(info: PickingInfo): void {
    const hovered = resolveHoveredFeature(info);
    if (!hovered) {
      clear();
      return;
    }

    const key = `${hovered.sourceLayerId}:${hovered.featureId}`;
    if (key === hoveredKey) {
      return;
    }

    hoveredKey = key;
    sourceLayerId = hovered.sourceLayerId;
    overlay = createHoverHighlightOverlay(info);
  }

  function clear(): void {
    if (hoveredKey === null && overlay === null) {
      return;
    }
    hoveredKey = null;
    sourceLayerId = null;
    overlay = null;
  }

  return {
    get overlay(): Layer | null {
      return overlay;
    },
    get sourceLayerId(): string | null {
      return sourceLayerId;
    },
    setFromPick,
    clear
  };
}

export const mapHoverHighlightStore = createMapHoverHighlightStore();
