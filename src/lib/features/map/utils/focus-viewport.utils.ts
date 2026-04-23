import { DOM_IDS } from '$lib/features/step-toolbar/step-toolbar.constants';

const FOCUS_TARGET_GAP_FROM_TOOL_PX = 30;

type RectBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function toRectBounds(rect: DOMRect | DOMRectReadOnly): RectBounds {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

function overlapsVertically(left: RectBounds, right: RectBounds): boolean {
  return left.top < right.bottom && left.bottom > right.top;
}

function overlapsHorizontally(left: RectBounds, right: RectBounds): boolean {
  return left.left < right.right && left.right > right.left;
}

function trimFocusAreaByHorizontalOccluder(
  focusArea: RectBounds,
  occluder: RectBounds
): RectBounds {
  if (
    !overlapsHorizontally(focusArea, occluder) ||
    !overlapsVertically(focusArea, occluder)
  ) {
    return focusArea;
  }

  const focusAreaMidX = focusArea.left + focusArea.width / 2;
  const blocksLeftSide =
    occluder.left <= focusAreaMidX && occluder.right > focusArea.left;
  const blocksRightSide =
    occluder.right >= focusAreaMidX && occluder.left < focusArea.right;

  if (!blocksLeftSide && !blocksRightSide) {
    return focusArea;
  }

  if (blocksLeftSide && !blocksRightSide) {
    const nextLeft = Math.min(occluder.right, focusArea.right);
    return {
      ...focusArea,
      left: nextLeft,
      width: Math.max(1, focusArea.right - nextLeft)
    };
  }

  if (!blocksLeftSide && blocksRightSide) {
    const nextRight = Math.max(occluder.left, focusArea.left);
    return {
      ...focusArea,
      right: nextRight,
      width: Math.max(1, nextRight - focusArea.left)
    };
  }

  const leftWidth = Math.max(0, occluder.left - focusArea.left);
  const rightWidth = Math.max(0, focusArea.right - occluder.right);

  if (rightWidth >= leftWidth) {
    const nextLeft = Math.min(occluder.right, focusArea.right);
    return {
      ...focusArea,
      left: nextLeft,
      width: Math.max(1, focusArea.right - nextLeft)
    };
  }

  const nextRight = Math.max(occluder.left, focusArea.left);
  return {
    ...focusArea,
    right: nextRight,
    width: Math.max(1, nextRight - focusArea.left)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getToolPopoverElement(): HTMLElement | null {
  const toolPopover = document.querySelector(
    `#${DOM_IDS.TOOL_POPOVER} .bx--popover`
  );

  return isVisibleElement(toolPopover) ? toolPopover : null;
}

function getFocusOccluders(): HTMLElement[] {
  const toolPopover = getToolPopoverElement();

  return [document.getElementById(DOM_IDS.STEP_TOOLBAR), toolPopover].filter(
    isVisibleElement
  );
}

function clampTargetCenterX(
  value: number,
  focusArea: RectBounds,
  targetWidth: number
): number {
  const inset = Math.max(0, targetWidth / 2);
  const min = focusArea.left + inset;
  const max = focusArea.right - inset;

  if (min > max) {
    return focusArea.left + focusArea.width / 2;
  }

  return clamp(value, min, max);
}

function getFocusTargetX(focusArea: RectBounds, targetWidth: number): number {
  const toolPopover = getToolPopoverElement();

  if (!toolPopover) {
    return focusArea.left + focusArea.width / 2;
  }

  const targetX =
    toolPopover.getBoundingClientRect().right +
    FOCUS_TARGET_GAP_FROM_TOOL_PX +
    targetWidth / 2;

  return clampTargetCenterX(targetX, focusArea, targetWidth);
}

export function getFocusViewportElement(
  overlayElement: HTMLElement | null | undefined
): HTMLElement | null {
  const viewportElement =
    overlayElement?.closest('.workspace-viewport') ??
    overlayElement?.closest('.main-content') ??
    null;

  return viewportElement instanceof HTMLElement ? viewportElement : null;
}

export function getFocusViewportRect(
  viewportElement: HTMLElement | null
): RectBounds | null {
  if (!viewportElement) {
    return null;
  }

  let focusArea = toRectBounds(viewportElement.getBoundingClientRect());

  for (const occluder of getFocusOccluders()) {
    focusArea = trimFocusAreaByHorizontalOccluder(
      focusArea,
      toRectBounds(occluder.getBoundingClientRect())
    );
  }

  return focusArea;
}

export function getElementCenteringDelta(
  viewportElement: HTMLElement | null,
  targetElement: HTMLElement | null
): { x: number; y: number } | null {
  const focusArea = getFocusViewportRect(viewportElement);

  if (!focusArea || !targetElement) {
    return null;
  }

  const targetRect = targetElement.getBoundingClientRect();
  const focusTargetX = getFocusTargetX(focusArea, targetRect.width);
  const focusCenterY = focusArea.top + focusArea.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  return {
    x: focusTargetX - targetCenterX,
    y: focusCenterY - targetCenterY
  };
}
