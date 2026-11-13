import type { PickingInfo } from '@deck.gl/core';

import {
  attachLabelDragController,
  type LabelEditRequest,
  type LabelHoverBox
} from '../interactions/label-drag.controller';

interface UseLabelEditingOptions {
  getContainer: () => HTMLElement | null | undefined;
  /** Labels can be moved and edited only while this holds. */
  isEnabled: () => boolean;
  pick: (x: number, y: number, radius: number) => PickingInfo | null;
}

/**
 * Label drag and text editing on a map canvas, shared by the single map and
 * the map collection, whose facets each keep their own label layout.
 */
export function useLabelEditing({
  getContainer,
  isEnabled,
  pick
}: UseLabelEditingOptions) {
  let hoverBox = $state.raw<LabelHoverBox | null>(null);
  let editRequest = $state.raw<LabelEditRequest | null>(null);

  $effect(() => {
    const container = getContainer();
    if (!container || !isEnabled()) {
      return;
    }

    const detach = attachLabelDragController({
      container,
      pick,
      onHoverChange: (box) => {
        hoverBox = box;
      },
      onEditLabel: (request) => {
        editRequest = request;
      }
    });

    return () => {
      detach();
      hoverBox = null;
      editRequest = null;
    };
  });

  return {
    get isOverLabel(): boolean {
      return hoverBox !== null;
    },
    /** The hovered label block, in pixels of the map container. */
    get hoverBox(): LabelHoverBox | null {
      return hoverBox;
    },
    get editRequest(): LabelEditRequest | null {
      return editRequest;
    },
    closeEditor(): void {
      editRequest = null;
    }
  };
}
