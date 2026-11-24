import type { PickingInfo } from '@deck.gl/core';

import { EVENT } from '$lib/features/commons/constants/dom.constants';
import {
  attachLabelDragController,
  pickLabelInContainer,
  type LabelEditRequest,
  type LabelHoverBox
} from '../interactions/label-drag.controller';

interface UseLabelEditingOptions {
  getContainer: () => HTMLElement | null | undefined;
  /** Labels can be moved and edited only while this holds. */
  isEnabled: () => boolean;
  /**
   * Synchronous on purpose: MapboxOverlay forwards only Deck.pickObject, which
   * deck.gl 9.4 deprecates in favor of pickObjectAsync.
   */
  pick: (x: number, y: number, radius: number) => PickingInfo | null;
  /** While editing is off, a double-click on a label calls onLockedLabel. */
  isHintEnabled?: () => boolean;
  onLockedLabel?: () => void;
}

/**
 * Label drag and text editing on a map canvas, shared by the single map and
 * the map collection, whose facets each keep their own label layout.
 */
export function useLabelEditing({
  getContainer,
  isEnabled,
  pick,
  isHintEnabled,
  onLockedLabel
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

  $effect(() => {
    const container = getContainer();
    if (!container || !onLockedLabel || isEnabled() || !isHintEnabled?.()) {
      return;
    }

    const handleDoubleClick = (event: MouseEvent) => {
      if (pickLabelInContainer(container, pick, event)) onLockedLabel();
    };
    container.addEventListener(EVENT.DBLCLICK, handleDoubleClick, true);
    return () =>
      container.removeEventListener(EVENT.DBLCLICK, handleDoubleClick, true);
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
