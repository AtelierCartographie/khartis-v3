import { EVENT } from '$lib/features/commons/constants/dom.constants';
import {
  PAGE_GUIDE_THRESHOLD_PX,
  snapRectToPageGuides,
  type PageGuideFrame
} from '$lib/features/commons/utils/page-guides.utils';
import { pageGuidesStore } from '../stores/page-guides.store.svelte';
import { setStylingToolPopoverDragging } from './tool-popover-drag-visibility.utils';

export interface DraggablePageItemPoint {
  x: number;
  y: number;
}

interface DraggablePageItemControllerOptions {
  getOverlayElement: () => HTMLElement | null;
  getPageScale: () => number;
  getCurrentPosition: () => DraggablePageItemPoint | null;
  normalizePosition: (
    position: DraggablePageItemPoint
  ) => DraggablePageItemPoint;
  setPosition: (position: DraggablePageItemPoint) => void;
  onDraggingChange: (active: boolean) => void;
  onPointerMove?: (event: PointerEvent) => void;
  onPointerUp?: () => void;
  /**
   * The page the item is laid on, when its positions are page coordinates:
   * the item is then pulled onto the page centre lines and margins.
   */
  getPageFrame?: () => PageGuideFrame | null;
}

interface DraggablePageItemStartOptions {
  event: PointerEvent;
  itemElement: HTMLElement;
}

export function areDraggablePageItemPointsEqual(
  left: DraggablePageItemPoint | null,
  right: DraggablePageItemPoint | null
): boolean {
  return left?.x === right?.x && left?.y === right?.y;
}

export function createDraggablePageItemController({
  getOverlayElement,
  getPageScale,
  getCurrentPosition,
  normalizePosition,
  setPosition,
  onDraggingChange,
  onPointerMove,
  onPointerUp,
  getPageFrame
}: DraggablePageItemControllerOptions): {
  start: (options: DraggablePageItemStartOptions) => boolean;
  stop: () => void;
} {
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let itemSize = { width: 0, height: 0 };

  function stop(): void {
    if (getPageFrame) pageGuidesStore.clear();
    isDragging = false;
    onDraggingChange(false);
    setStylingToolPopoverDragging(false);
    window.removeEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.removeEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handlePointerUp(): void {
    onPointerUp?.();
    stop();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!isDragging) {
      return;
    }

    onPointerMove?.(event);

    const overlayElement = getOverlayElement();
    if (!overlayElement) {
      return;
    }

    const scale = getPageScale();
    const rect = overlayElement.getBoundingClientRect();
    const position = normalizePosition({
      x: (event.clientX - rect.left) / scale - dragOffsetX,
      y: (event.clientY - rect.top) / scale - dragOffsetY
    });

    setPosition(alignToPage(position, scale));
  }

  // A guide close by wins over the grid snapping of normalizePosition, on the
  // axis it applies to.
  function alignToPage(
    position: DraggablePageItemPoint,
    scale: number
  ): DraggablePageItemPoint {
    const frame = getPageFrame?.();
    if (!frame) return position;
    const snap = snapRectToPageGuides(
      { ...position, ...itemSize },
      frame,
      PAGE_GUIDE_THRESHOLD_PX / scale
    );
    pageGuidesStore.show(snap.guides);
    return {
      x: snap.guides.vertical.length > 0 ? snap.x : position.x,
      y: snap.guides.horizontal.length > 0 ? snap.y : position.y
    };
  }

  function start({
    event,
    itemElement
  }: DraggablePageItemStartOptions): boolean {
    const overlayElement = getOverlayElement();
    if (!overlayElement) {
      return false;
    }

    const scale = getPageScale();
    const overlayRect = overlayElement.getBoundingClientRect();
    const itemRect = itemElement.getBoundingClientRect();
    itemSize = {
      width: itemRect.width / scale,
      height: itemRect.height / scale
    };
    const currentX = (itemRect.left - overlayRect.left) / scale;
    const currentY = (itemRect.top - overlayRect.top) / scale;
    const currentPosition = getCurrentPosition();
    const dragPosition = normalizePosition(
      currentPosition ?? {
        x: currentX,
        y: currentY
      }
    );

    if (!areDraggablePageItemPointsEqual(dragPosition, currentPosition)) {
      setPosition(dragPosition);
    }

    dragOffsetX = (event.clientX - overlayRect.left) / scale - dragPosition.x;
    dragOffsetY = (event.clientY - overlayRect.top) / scale - dragPosition.y;

    isDragging = true;
    onDraggingChange(true);
    setStylingToolPopoverDragging(true);
    window.addEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.addEventListener(EVENT.POINTERUP, handlePointerUp);

    return true;
  }

  return {
    start,
    stop
  };
}
