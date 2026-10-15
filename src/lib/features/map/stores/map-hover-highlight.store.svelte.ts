import type { Layer, PickingInfo } from '@deck.gl/core';

import {
  createHoverHighlightOverlay,
  resolveHoveredFeature
} from '../layers/hover-highlight-overlay';

/** The hovered feature's row, read by column name for the legends. */
export interface HoveredRow {
  datasetId: string;
  /** The visualization of the hovered map, a collection's own map included. */
  vizId: string;
  readValue: (column: string) => unknown;
}

// Kept apart from the search highlight: hovering must neither clear a search
// selection nor rebuild the thematic layers.
function createMapHoverHighlightStore() {
  let overlay = $state.raw<Layer | null>(null);
  let hoveredRow = $state.raw<HoveredRow | null>(null);
  let sourceLayerId: string | null = null;
  let hoveredKey: string | null = null;

  function setFromPick(info: PickingInfo, row: HoveredRow | null): void {
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
    hoveredRow = row;
  }

  function clear(): void {
    if (hoveredKey === null && overlay === null && hoveredRow === null) {
      return;
    }
    hoveredKey = null;
    sourceLayerId = null;
    overlay = null;
    hoveredRow = null;
  }

  return {
    get overlay(): Layer | null {
      return overlay;
    },
    get sourceLayerId(): string | null {
      return sourceLayerId;
    },
    get hoveredRow(): HoveredRow | null {
      return hoveredRow;
    },
    setFromPick,
    clear
  };
}

export const mapHoverHighlightStore = createMapHoverHighlightStore();
