export interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

const VIEWPORT_MARGIN = 8;

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
