export interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export interface DropdownAnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface ComputeFlippedPositionOptions {
  triggerRect: DropdownAnchorRect;
  dropdownHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  width?: number;
}

export interface FlippedScrollableDropdownPosition extends DropdownPosition {
  maxHeight: number;
  openUpward: boolean;
}

const VIEWPORT_MARGIN = 8;

interface DropdownFlip {
  openUpward: boolean;
  availableHeight: number;
}

function getMeasuredDropdownHeight(
  dropdownHeight: number,
  viewportHeight: number,
  margin: number
): number {
  return Math.min(
    Math.max(dropdownHeight, 0),
    Math.max(viewportHeight - margin * 2, 0)
  );
}

function computeDropdownFlip({
  triggerRect,
  dropdownHeight,
  viewportHeight,
  margin
}: Pick<
  ComputeFlippedPositionOptions,
  'triggerRect' | 'dropdownHeight' | 'viewportHeight' | 'margin'
>): DropdownFlip {
  const measuredHeight = getMeasuredDropdownHeight(
    dropdownHeight,
    viewportHeight,
    margin ?? VIEWPORT_MARGIN
  );
  const effectiveMargin = margin ?? VIEWPORT_MARGIN;
  const spaceBelow = Math.max(
    viewportHeight - triggerRect.bottom - effectiveMargin,
    0
  );
  const spaceAbove = Math.max(triggerRect.top - effectiveMargin, 0);
  const openUpward = spaceBelow < measuredHeight && spaceAbove > spaceBelow;

  return {
    openUpward,
    availableHeight: openUpward ? spaceAbove : spaceBelow
  };
}

export function clampDropdownToViewport(
  position: DropdownPosition,
  dropdownHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = VIEWPORT_MARGIN
): DropdownPosition {
  const maxLeft = Math.max(margin, viewportWidth - position.width - margin);
  const maxTop = Math.max(margin, viewportHeight - dropdownHeight - margin);
  return {
    width: position.width,
    left: Math.min(Math.max(position.left, margin), maxLeft),
    top: Math.min(Math.max(position.top, margin), maxTop)
  };
}

export function computeFlippedPosition({
  triggerRect,
  dropdownHeight,
  viewportWidth,
  viewportHeight,
  margin = VIEWPORT_MARGIN,
  width = triggerRect.width
}: ComputeFlippedPositionOptions): DropdownPosition {
  const flip = computeDropdownFlip({
    triggerRect,
    dropdownHeight,
    viewportHeight,
    margin
  });

  return clampDropdownToViewport(
    {
      top: flip.openUpward
        ? triggerRect.top - dropdownHeight
        : triggerRect.bottom,
      left: triggerRect.left,
      width
    },
    dropdownHeight,
    viewportWidth,
    viewportHeight,
    margin
  );
}

export function computeFlippedScrollablePosition({
  triggerRect,
  dropdownHeight,
  viewportWidth,
  viewportHeight,
  margin = VIEWPORT_MARGIN,
  width = triggerRect.width
}: ComputeFlippedPositionOptions): FlippedScrollableDropdownPosition {
  const measuredHeight = getMeasuredDropdownHeight(
    dropdownHeight,
    viewportHeight,
    margin
  );
  const flip = computeDropdownFlip({
    triggerRect,
    dropdownHeight: measuredHeight,
    viewportHeight,
    margin
  });
  const visibleHeight = Math.min(measuredHeight, flip.availableHeight);
  const position = clampDropdownToViewport(
    {
      top: flip.openUpward
        ? triggerRect.top - visibleHeight
        : triggerRect.bottom,
      left: triggerRect.left,
      width
    },
    visibleHeight,
    viewportWidth,
    viewportHeight,
    margin
  );

  return {
    ...position,
    maxHeight: flip.availableHeight,
    openUpward: flip.openUpward
  };
}
