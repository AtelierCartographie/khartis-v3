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
