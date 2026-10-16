export interface TooltipViewerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export interface TooltipViewportSize {
  width: number;
  height: number;
}

export type TooltipPlacement = 'above-viewer' | 'inside-viewer-top';

export interface ResolveTooltipViewportPositionParams {
  viewerRect?: TooltipViewerRect | null;
  tooltipSize: TooltipSize;
  viewportSize: TooltipViewportSize;
  padding: number;
  gap: number;
  placement?: TooltipPlacement;
}

export interface TooltipViewportPosition {
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function resolveTooltipViewportPosition({
  viewerRect,
  tooltipSize,
  viewportSize,
  padding,
  gap,
  placement = 'above-viewer'
}: ResolveTooltipViewportPositionParams): TooltipViewportPosition {
  const preferredLeft =
    (viewerRect ? viewerRect.left + viewerRect.width : viewportSize.width) -
    padding -
    tooltipSize.width;
  const maxLeft = viewportSize.width - padding - tooltipSize.width;
  const left = clamp(preferredLeft, padding, maxLeft);

  const viewerTop = viewerRect?.top ?? padding;
  const topAboveViewer = viewerTop - tooltipSize.height - gap;
  const topInsideViewer = viewerTop + padding;
  const maxTop = viewportSize.height - padding - tooltipSize.height;
  const top = clamp(
    placement === 'inside-viewer-top' ? topInsideViewer : topAboveViewer,
    placement === 'inside-viewer-top' ? topInsideViewer : padding,
    maxTop
  );

  return { left, top };
}

export interface TooltipBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ResolveCursorTooltipPositionParams {
  cursor: { x: number; y: number };
  tooltipSize: TooltipSize;
  bounds: TooltipBounds;
  padding: number;
  offset: number;
}

// Below-right of the cursor, flipped to the other side on an axis where it
// would leave the bounds, so the pointer never covers what it describes and
// the tooltip never slides under the side panels.
export function resolveCursorTooltipPosition({
  cursor,
  tooltipSize,
  bounds,
  padding,
  offset
}: ResolveCursorTooltipPositionParams): TooltipViewportPosition {
  const minLeft = bounds.left + padding;
  const maxLeft = bounds.right - padding - tooltipSize.width;
  const minTop = bounds.top + padding;
  const maxTop = bounds.bottom - padding - tooltipSize.height;
  const right = cursor.x + offset;
  const below = cursor.y + offset;
  const left = right <= maxLeft ? right : cursor.x - offset - tooltipSize.width;
  const top = below <= maxTop ? below : cursor.y - offset - tooltipSize.height;

  return {
    left: clamp(left, minLeft, maxLeft),
    top: clamp(top, minTop, maxTop)
  };
}
