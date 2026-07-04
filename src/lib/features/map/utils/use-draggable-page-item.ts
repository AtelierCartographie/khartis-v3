import { EVENT } from '$lib/features/commons/constants/dom.constants';
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
  onPointerUp
}: DraggablePageItemControllerOptions): {
  start: (options: DraggablePageItemStartOptions) => boolean;
  stop: () => void;
} {
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function stop(): void {
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

    setPosition(position);
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
