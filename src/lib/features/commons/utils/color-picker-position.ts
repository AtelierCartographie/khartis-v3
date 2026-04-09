interface RectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface ViewportLike {
  width: number;
  height: number;
}

interface ResolveColorPickerDropdownPositionOptions {
  triggerRect: RectLike;
  dropdownHeight: number;
  viewport: ViewportLike;
  preferredWidth?: number;
  margin?: number;
}

interface ResolvedColorPickerDropdownPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpward: boolean;
}

const DEFAULT_DROPDOWN_WIDTH = 370;
const DEFAULT_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function resolveColorPickerDropdownPosition({
  triggerRect,
  dropdownHeight,
  viewport,
  preferredWidth = DEFAULT_DROPDOWN_WIDTH,
  margin = DEFAULT_MARGIN
}: ResolveColorPickerDropdownPositionOptions): ResolvedColorPickerDropdownPosition {
  const availableWidth = Math.max(viewport.width - margin * 2, 0);
  const width = Math.min(preferredWidth, availableWidth);
  const left = clamp(triggerRect.left, margin, viewport.width - margin - width);

  const maxViewportHeight = Math.max(viewport.height - margin * 2, 0);
  const measuredHeight = Math.min(
    Math.max(dropdownHeight, 0),
    maxViewportHeight
  );
  const spaceBelow = Math.max(viewport.height - triggerRect.bottom - margin, 0);
  const spaceAbove = Math.max(triggerRect.top - margin, 0);
  const openUpward = spaceBelow < measuredHeight && spaceAbove > spaceBelow;
  const availableHeight = openUpward ? spaceAbove : spaceBelow;
  const visibleHeight = Math.min(measuredHeight, availableHeight);
  const top = clamp(
    openUpward ? triggerRect.top - visibleHeight : triggerRect.bottom,
    margin,
    viewport.height - margin - visibleHeight
  );

  return {
    top,
    left,
    width,
    maxHeight: availableHeight,
    openUpward
  };
}
