import type { PickingInfo } from '@deck.gl/core';

import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';

import {
  getLabelEditingContext,
  type LabelEditingContext
} from '../layers/text-layer-factory';
import type { TextLayerDatum } from '../layers/text-layer-data.utils';
import { labelLayoutStore } from '../stores/label-layout.store.svelte';
import type { LabelOffset } from '../utils/label-layout.utils';
import { setStylingToolPopoverDragging } from '../utils/tool-popover-drag-visibility.utils';

const DRAG_THRESHOLD_PX = 3;
const PICK_RADIUS_PX = 2;

export interface PickedLabel {
  context: LabelEditingContext;
  datum: TextLayerDatum;
  featureKey: string;
}

export interface LabelEditRequest extends PickedLabel {
  clientX: number;
  clientY: number;
}

interface LabelDragControllerOptions {
  container: HTMLElement;
  pick: (x: number, y: number, radius: number) => PickingInfo | null;
  onHoverChange: (isOverLabel: boolean) => void;
  onEditLabel: (request: LabelEditRequest) => void;
}

interface ActiveDrag extends PickedLabel {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCenter: LabelOffset;
  center: LabelOffset;
  isMoving: boolean;
}

/**
 * Lets the user drag a thematic label in the Styling step, and open its
 * editor with a double-click. Listeners run in
 * the capture phase on the map container, so a press on a label never reaches
 * the Deck.gl controller or MapLibre's drag-pan, and a press anywhere else
 * passes through untouched.
 */
export function attachLabelDragController({
  container,
  pick,
  onHoverChange,
  onEditLabel
}: LabelDragControllerOptions): () => void {
  let drag: ActiveDrag | null = null;
  let previewFrame: number | null = null;
  let hoverFrame: number | null = null;
  let isHovering = false;

  function pickLabel(point: {
    clientX: number;
    clientY: number;
  }): PickedLabel | null {
    const rect = container.getBoundingClientRect();
    const info = pick(
      point.clientX - rect.left,
      point.clientY - rect.top,
      PICK_RADIUS_PX
    );
    const context = getLabelEditingContext(info?.layer);
    const datum = info?.object as TextLayerDatum | undefined;
    if (!context || !datum) return null;
    const featureKey = context.resolveFeatureKey(datum);
    return featureKey ? { context, datum, featureKey } : null;
  }

  function setHovering(next: boolean): void {
    if (next === isHovering) return;
    isHovering = next;
    onHoverChange(next);
  }

  function cancelPreviewFrame(): void {
    if (previewFrame !== null) {
      cancelAnimationFrame(previewFrame);
      previewFrame = null;
    }
  }

  function stopDrag(commit: boolean): void {
    const finished = drag;
    drag = null;
    cancelPreviewFrame();
    window.removeEventListener(EVENT.POINTERMOVE, handleDragMove);
    window.removeEventListener(EVENT.POINTERUP, handleDragEnd);
    window.removeEventListener(EVENT.POINTERCANCEL, handleDragCancel);
    window.removeEventListener(EVENT.KEYDOWN, handleDragKeydown, true);
    if (!finished?.isMoving) return;

    if (commit) {
      labelLayoutStore.setOffset(
        finished.context.vizId,
        finished.featureKey,
        finished.center
      );
    }
    labelLayoutStore.endDrag();
    setStylingToolPopoverDragging(false);
  }

  function handleDragMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (!drag.isMoving && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
      return;
    }

    const scale = drag.context.pageDisplayScale;
    drag.center = [
      drag.startCenter[0] + deltaX / scale,
      drag.startCenter[1] + deltaY / scale
    ];

    if (!drag.isMoving) {
      drag.isMoving = true;
      setStylingToolPopoverDragging(true);
      labelLayoutStore.beginDrag(
        { vizId: drag.context.vizId, featureKey: drag.featureKey },
        drag.context.buildDragPreview(drag.datum, drag.center)
      );
      return;
    }

    if (previewFrame !== null) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = null;
      if (!drag) return;
      labelLayoutStore.updateDragPreview(
        drag.context.buildDragPreview(drag.datum, drag.center)
      );
    });
  }

  function handleDragEnd(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stopDrag(true);
  }

  function handleDragCancel(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stopDrag(false);
  }

  function handleDragKeydown(event: KeyboardEvent): void {
    if (event.key !== KEY.ESCAPE || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    stopDrag(false);
  }

  function handlePointerDown(event: PointerEvent): void {
    if (drag || event.button !== 0 || !event.isPrimary) return;
    const picked = pickLabel(event);
    if (!picked) return;

    event.preventDefault();
    event.stopPropagation();
    const startCenter = picked.context.resolveBlockCenter(picked.datum);
    drag = {
      ...picked,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCenter,
      center: startCenter,
      isMoving: false
    };
    window.addEventListener(EVENT.POINTERMOVE, handleDragMove);
    window.addEventListener(EVENT.POINTERUP, handleDragEnd);
    window.addEventListener(EVENT.POINTERCANCEL, handleDragCancel);
    window.addEventListener(EVENT.KEYDOWN, handleDragKeydown, true);
  }

  function handleDoubleClick(event: MouseEvent): void {
    const picked = pickLabel(event);
    if (!picked) return;
    event.preventDefault();
    event.stopPropagation();
    onEditLabel({
      ...picked,
      clientX: event.clientX,
      clientY: event.clientY
    });
  }

  function handleHoverMove(event: PointerEvent): void {
    if (drag || event.pointerType === 'touch' || hoverFrame !== null) return;
    const { clientX, clientY } = event;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = null;
      if (drag) return;
      setHovering(pickLabel({ clientX, clientY }) !== null);
    });
  }

  function handlePointerLeave(): void {
    if (!drag) setHovering(false);
  }

  container.addEventListener(EVENT.POINTERDOWN, handlePointerDown, true);
  container.addEventListener(EVENT.DBLCLICK, handleDoubleClick, true);
  container.addEventListener(EVENT.POINTERMOVE, handleHoverMove);
  container.addEventListener(EVENT.POINTERLEAVE, handlePointerLeave);

  return () => {
    stopDrag(false);
    if (hoverFrame !== null) {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = null;
    }
    setHovering(false);
    container.removeEventListener(EVENT.POINTERDOWN, handlePointerDown, true);
    container.removeEventListener(EVENT.DBLCLICK, handleDoubleClick, true);
    container.removeEventListener(EVENT.POINTERMOVE, handleHoverMove);
    container.removeEventListener(EVENT.POINTERLEAVE, handlePointerLeave);
  };
}
