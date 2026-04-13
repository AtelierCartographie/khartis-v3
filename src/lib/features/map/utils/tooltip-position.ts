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

export interface ResolveTooltipViewportPositionParams {
  viewerRect?: TooltipViewerRect | null;
  tooltipSize: TooltipSize;
  viewportSize: TooltipViewportSize;
  padding: number;
  gap: number;
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
  gap
}: ResolveTooltipViewportPositionParams): TooltipViewportPosition {
  const preferredLeft = (viewerRect?.left ?? 0) + padding;
  const maxLeft = viewportSize.width - padding - tooltipSize.width;
  const left = clamp(preferredLeft, padding, maxLeft);

  const topAboveViewer =
    (viewerRect?.top ?? padding) - tooltipSize.height - gap;
  const maxTop = viewportSize.height - padding - tooltipSize.height;
  const top =
    topAboveViewer >= padding
      ? topAboveViewer
      : clamp((viewerRect?.top ?? 0) + padding, padding, maxTop);

  return { left, top };
}
