import { computeFlippedScrollablePosition } from './dropdown-position.utils';

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

export function resolveColorPickerDropdownPosition({
  triggerRect,
  dropdownHeight,
  viewport,
  preferredWidth = DEFAULT_DROPDOWN_WIDTH,
  margin = DEFAULT_MARGIN
}: ResolveColorPickerDropdownPositionOptions): ResolvedColorPickerDropdownPosition {
  const availableWidth = Math.max(viewport.width - margin * 2, 0);
  const width = Math.min(preferredWidth, availableWidth);
  const position = computeFlippedScrollablePosition({
    triggerRect,
    dropdownHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    margin,
    width
  });

  return {
    top: position.top,
    left: position.left,
    width: position.width,
    maxHeight: position.maxHeight,
    openUpward: position.openUpward
  };
}
